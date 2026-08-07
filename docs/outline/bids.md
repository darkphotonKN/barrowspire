# Outline — Bids（marketplace-service）

買家對 listing 出價。這份是**結構藍圖** —— 講這個功能要做什麼、為什麼這樣做、跟哪些
service 有關係。實作細節和待辦清單不在這裡：

- 行為與能力 → [`marketplace-service/SPECIFICATION.md`](../../game-server/marketplace-service/SPECIFICATION.md)
- 資料表 → [`docs/schema/bids.md`](../../game-server/marketplace-service/docs/schema/bids.md)
- 架構決策 → `docs/adr/`
- 程式碼 → `internal/listing/`

PR [#8](https://github.com/darkphotonKN/barrowspire/pull/8)

---

## 1. 背景

拍賣要成立，兩件事必須同時為真：**同一時間只有一個領先者**，而且**領先者的錢真的凍得住**。

第一件是 marketplace 自己的事，已經做完。第二件要跨服務 —— 錢在 wallet-service 手上，
marketplace 沒有權限直接動別人的餘額。這是整個功能的難點，也還沒做。

所以這個功能天然分兩階段：

```
階段一（已完成）  出價的規則和單一贏家不變式，全在 marketplace 內
階段二（未開始）  出價連動 wallet 的錢，跨服務 saga
```

---

## 2. 領域模型

### Bid 屬於 Listing，不是獨立的 aggregate

```
Listing（aggregate root）
  ├─ 持有 bids []*Bid
  ├─ PlaceBid()      ← 唯一能產生 bid 的入口
  └─ WithdrawBid()
```

`newBid` 是 package-private，沒有 `BidRepository`，bid 一律隨著它的 listing 一起載入和寫入。
結構上等同 wallet-service 的 `Account` / `WalletHold`。

**為什麼不讓 Bid 獨立**：出價一次要同時改兩筆 bid —— 舊的降級、新的上位。DDD 的規則是
一個交易只改一個 aggregate，拆開之後這兩件事只能分兩次寫：

```
交易 1：新 bid 設 WINNING     ← 這一刻資料庫裡有兩筆 WINNING
交易 2：舊 bid 轉 OUTBID
```

中間那個窗口只要有人讀到，看到的就是兩個領先者；交易 2 若失敗，資料庫永遠停在那裡。
不變式會變成沒有人守得住。

### Bid 狀態機

```
WINNING ──→ OUTBID      被更高的出價擠掉
        ──→ WON         結算得標
        ──→ CANCELLED   買家撤回
```

三個終端狀態都是死路，FSM 白名單裡不為它們建 entry。輸家降級而不刪除，所以 `bids` 表
本身就是完整的出價歷史。

### 兩個刻意的取捨

**出價門檻的比較符號不對稱**：第一筆 `amount >= start_price`（等於底價可以），之後
`amount > 現任 WINNING`（必須嚴格超過）。

**撤回領先者不遞補亞軍**。拍賣直覺上第二名該補上，但一旦連動 wallet：亞軍的 hold 早在
被擠掉時就釋放了，硬把他拉回領先位，這筆出價背後沒有錢。要遞補就得重新下一次 hold，
那是階段二的事。目前撤回後 listing 暫時沒有領先者，`currentPrice()` 掉回底價 —— 單一
贏家不變式仍然成立，零個也合法。

---

## 3. 單一贏家不變式：兩道防線

這是整個功能的核心規則，也是所有併發問題的源頭。

```
┌─ 防線一：domain（記憶體、單一交易內）
│  PlaceBid 裡把「舊的降級」和「新的上位」一起做完
│  擋得住：同一個交易內的邏輯錯誤
│  擋不住：兩個連線各自載入同一個 listing
│
└─ 防線二：資料庫（跨連線）
   CREATE UNIQUE INDEX idx_bids_single_winner
       ON bids(listing_id) WHERE status = 'WINNING';
   擋得住：真正的併發寫入
```

兩個併發出價者各自載入同一個 listing 時，兩邊記憶體都認為自己是新王 —— 防線一在這裡
完全沒用，只有資料庫擋得住。輸的那個拿到 `ErrConcurrentModification`，重試。

索引是 **partial** 的（`WHERE status = 'WINNING'`），所以降級成 `OUTBID` 或結算成 `WON`
都會離開索引、把位子讓出來。這個細節在階段二會變成一個坑，見 §5。

### OCC 守的是 listing，不是 bid

`listings` 有 `version` 欄位，`Save` 的 UPDATE 帶 `WHERE version = $expected`，影響 0 列
就是有人插隊，重載入再試，最多 5 次。

`bids` 沒有 version。所以 bid 的寫入不在 OCC 的保護範圍內 —— 「同時只有一個 WINNING」
實際上是靠那條 partial index 在守，OCC 守的是 listing 那一列。

目前沒有任何 row lock（`SELECT FOR UPDATE`、`SERIALIZABLE` 都沒有），寫入走 Postgres 預設的
`READ COMMITTED`。熱門 listing 上這會退化成重試風暴，`SPECIFICATION.md` 已經把 row lock
列為預留的逃生口，但要有真實流量數據再決定 —— OCC 在低競爭下比 lock 好，高競爭才反過來。

---

## 4. 跨服務：誰負責什麼

出價要凍錢，錢不在 marketplace 手上。

```
                    ┌──────────────────┐
                    │  marketplace     │  listings / bids
                    │  （orchestrator）│  單一贏家不變式
                    └────────┬─────────┘
                             │ 事件（AMQP）
                    ┌────────┴─────────┐
                    │                  │
           ┌────────▼──────┐   ┌───────▼────────┐
           │    wallet     │   │  Stash / items │
           │  gold / holds │   │ ItemInstance   │
           │  （participant）│   │    status      │
           └───────────────┘   └────────────────┘
```

| service | 擁有什麼 | 出價流程裡的角色 |
|---|---|---|
| **marketplace** | `listings`、`bids` | orchestrator。決定誰是領先者 |
| **wallet** | 買家的 gold 和 hold | participant。凍結 / 扣款 / 退回 |
| **Stash（items）** | `ItemInstance.status` | 物品的「不能同時在兩個地方」由它守，marketplace 只依賴不擁有 |

marketplace 是唯一的 orchestrator，另外兩個都只回應事件。這個分工是 spec 定的，不是實作
選擇。

**傳輸方式是事件，不是同步呼叫。** `SPECIFICATION.md:66-70` 規定走 AMQP，wallet 那側的 spec
也一致（AMQP consumer 是 primary 寫入路徑，gRPC 寫入標 ⏳ PLANNED）。差別不只是傳輸層：
同步呼叫下 `PENDING` 只活幾毫秒，非同步下它是真的會滯留的狀態，要配 timeout 和對帳。

---

## 5. 階段二：出價連動 wallet hold

TCC（Try-Confirm-Cancel）：

```
Try      PlaceHold    出價時凍結買家的錢
Confirm  CommitHold   成交時真的扣款
Cancel   ReleaseHold  被擠掉或撤回時退回
```

### Happy path

```
marketplace                              wallet
    │
 ┌──┴──────────────────┐
 │ 建 Bid (PENDING)    │  同一個交易 —— 這是關鍵
 │ + outbox row        │  CreateOutboxTx
 └──┬──────────────────┘
    │
    │  bid.initiated
    ├─────────────────────────────────────→│
    │                            PlaceHoldUC.Handle
    │                                       │
    │       hold.created                    │
    │←──────────────────────────────────────┤
    │
 PENDING → WINNING
 前任 → OUTBID
```

左上那個框是整張圖的重點：bid 的 row 和 outbox 的 row 必須在同一個交易。分開寫的話，
出價成功了但事件掉了，bid 會永遠卡在 `PENDING`。

### 失敗與補償

```
hold.failed  →  bid 設 FAILED，前任不動，listing 維持原本的 WINNING

被擠掉        →  舊 WINNING → OUTBID
                 └→ 必須釋放它的 hold
```

第二條線是階段二最重要的缺口：`ReleaseHold` 目前**整個不存在**。沒有它，被擠掉的出價者
錢會永遠凍著。

### PENDING 的併發窗口（開放問題）

```
A: PENDING ──bid.initiated──→ hold A ok
B: PENDING ──bid.initiated──→ hold B ok
                  │
       兩個 hold.created 都回來了
                  │
    ┌─────────────┴─────────────┐
 A 先到                       B 後到
 PENDING→WINNING           撞 idx_bids_single_winner
                                 │
                      B 的 hold 已下但升不上去
                      → FAILED + ReleaseHold
                      或 → 重新比價後重試
```

原因回到 §3 那個 partial index：條件是 `WHERE status = 'WINNING'`，`PENDING` 不在索引內，
資料庫不會擋兩個同時 `PENDING` 的 bid，兩邊的 hold 都會下成功。

同步版本沒有這個問題（窗口只有幾毫秒），改成非同步之後窗口被拉開成一個完整的 round trip。
**spec 沒有寫這條路徑，上面兩種收法都還沒定案。**

---

## 6. 現況與缺口

**已完成**：出價 / 撤回的完整規則、單一贏家不變式的兩道防線、bid 持久化與歷史保留。

**缺口**（細節見 `SPECIFICATION.md` 和 issue）：

| 缺口 | 卡住什麼 |
|---|---|
| 冪等性完全沒有實作 | 重送同一筆出價 = 自己跟自己競標 |
| wallet 缺 `ReleaseHold` | 沒有補償路徑，錢會永久凍結 |
| `bids.status` 缺 `PENDING` / `FAILED` | saga 的中間狀態無處可存 |
| `common/outbox` 未在 marketplace 接線 | 事件會遺失 |
| PENDING 併發窗口未定案 | 見 §5 |

前四項是階段二的前置條件，沒做完 saga 無法正確運作。冪等性和 `ReleaseHold` 之中，
`ReleaseHold` 更急 —— 前者造成尷尬，後者造成資損。

---

## 這份文件的定位

repo 有既定的文件路由（`CLAUDE.md` §Spec & docs routing）。這份 outline 的內容按規矩應該拆到：

- 能力清單 → `marketplace-service/SPECIFICATION.md` 的 thin line
- 深入設計與 API surface → `docs/specs/NNNN-*.md`
- 「Bid 為何是 entity」「撤回不遞補亞軍」 → `docs/adr/`
- Bid / WINNING / OUTBID 詞彙 → `marketplace-service/CONTEXT.md`（目前仍是空白樣板）

拆分前以本文為準，拆分後本文改為純索引。
