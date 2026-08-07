# Outline — Bids（marketplace-service）

買家對 listing 出價的功能。這份是導覽，權威文件在別處：

- 行為與能力：[`marketplace-service/SPECIFICATION.md`](../../game-server/marketplace-service/SPECIFICATION.md)
- 資料表細節：[`docs/schema/bids.md`](../../game-server/marketplace-service/docs/schema/bids.md)
- 架構決策：`docs/adr/`（本文的取捨還沒寫成 ADR，見文末）

PR [#8](https://github.com/darkphotonKN/barrowspire/pull/8)

---

## 一句話

出價高的人取代前一位領先者，而「同時只能有一個領先者」由 domain 和資料庫各守一道。

---

## 這次做了什麼

| 層 | 檔案 | 內容 |
|---|---|---|
| domain | `domain/listing/bid.go` | `Bid` entity、`BidType`、`BidStatus` |
| domain | `domain/listing/bid_fsm.go` | 狀態轉換白名單 |
| domain | `domain/listing/listing.go` | `PlaceBid`、`WithdrawBid`、`Listing` 持有 bids |
| migration | `migrations/000002_create_bids_table.*` | `bids` 表 + partial unique index |
| repository | `repository/listing_repository.go` | `FindByID` 載入 bids、`Save` diff 後寫入 |
| 測試 | `domain/listing/listing_test.go` | 16 條，含反向驗證 |

---

## 核心概念

### Bid 是 Listing 內的 entity，不是獨立的 aggregate

`SPECIFICATION.md` 這樣規定。實務上的意義：

- `newBid` 是 package-private，外層無法繞過 `Listing.PlaceBid` 生出一筆 bid
- 沒有 BidRepository，bid 一律透過它所屬的 listing 載入與寫入
- `bids` 表沒有 version 欄位，OCC 守的是 listing 的 version

結構上等同 wallet-service 的 `Account` / `WalletHold`。

### 單一贏家不變式

一個 listing 同時最多一筆 `WINNING` 的 bid。這條規則由兩道防線守。

**domain（記憶體、單一交易內）**

出價一次要改兩筆 bid：舊的轉 `OUTBID`、新的設 `WINNING`。這兩件事在 `Listing.PlaceBid` 裡一起做完，所以不會有「兩個都是 WINNING」的中間狀態被別人看到。

Bid 因此不能是獨立的 aggregate。DDD 的規則是一個交易只改一個 aggregate，所以拆開後只能分兩次寫：

```
交易 1：新 bid 設 WINNING     ← 這一刻資料庫裡有兩筆 WINNING
交易 2：舊 bid 轉 OUTBID
```

兩次寫之間如果有人讀到這個 listing，看到的就是兩個領先者。交易 2 若失敗，資料庫就永遠停在那個狀態。

**資料庫（跨連線併發）**

```sql
CREATE UNIQUE INDEX idx_bids_single_winner
    ON bids(listing_id) WHERE status = 'WINNING';
```

兩個併發出價者各自載入同一個 listing 時，兩邊記憶體都認為自己是新王。只有資料庫擋得住。輸的那個會拿到 `ErrConcurrentModification`，`withRetry` 重新載入再試。

索引是 partial 的（`WHERE status = 'WINNING'`），所以降級成 `OUTBID` 或結算成 `WON` 都會離開索引、把位子讓出來。

### Bid 狀態機

```
WINNING ──→ OUTBID      被更高的出價擠掉
        ──→ WON         結算得標
        ──→ CANCELLED   買家撤回
```

`OUTBID` / `WON` / `CANCELLED` 都是終端。白名單裡不為它們建 entry，查詢時自然被擋。

狀態常數帶 `Bid` 前綴（`BidStatusWinning` 之類），因為同一個 package 裡 `listing.go` 已占用裸的 `StatusDraft` / `StatusActive` / `StatusWithdraw` / `StatusSold`。

### 出價門檻有兩種比較符號

```
第一筆出價    amount >= start_price     等於底價可以
之後          amount >  現任 WINNING     等於不夠，必須超過
```

驗證失敗直接 `return`，位置在 `newBid` 之前。被拒絕的出價根本沒有 Bid 物件產生，不會留下幽靈紀錄。

### 輸家降級，不刪除

`WINNING → OUTBID`，資料列保留。bids 表本身就是完整的出價歷史，誰在什麼時候出多少、被誰擠掉，都查得到。

---

## 兩個容易寫錯的地方

### `Save` 的 UPDATE 必須在 INSERT 之前

跟 wallet-service 的 `Save` 相反。

`PlaceBid` 會同時產生「一筆新的 WINNING」和「一筆降級的 OUTBID」。新舊 bid 的 `listing_id` 相同，若先 INSERT 就會撞上那條 partial unique index，因為舊王還沒降級。

wallet 沒這問題，它的 unique 在 `bid_id` 上，每筆 hold 都不同。

如果日後有人「照 wallet 對齊一下」把順序改回來，會在執行期炸。

### `Reconstitute` 不呼叫 `newBid`

從資料庫載入時直接建 `&Bid{...}`。reconstitute 是還原既有事實，不是建立新東西，走 `newBid` 會把每一筆歷史 bid 都強制設成 `WINNING`。

`Reconstitute` 另外會重新驗證單一贏家不變式，發現兩個以上領先者就回 `ErrCorruptListingState` 拒絕載入。這是安全網：資料破損時寧可停下來，也不讓錯誤狀態繼續交易。

---

## PR 後續修正

初稿寫完後修掉三條，都在 marketplace-service 內，沒動 wallet。

### `withRetry` 現在吃 `ctx`（L2 的一部分）

原本 jitter 是裸的 `time.Sleep`。請求取消了它照睡，最多 25ms，中斷不了。這件事沒寫在簽名上，但每個呼叫者都得知道。

```go
select {
case <-ctx.Done():
    return ctx.Err()
case <-time.After(jitterTime):
}
```

`mark_sold_listing_usecase.go` 和 `withdraw_listing_usecase.go` 本來就有 `ctx`，往下傳就好。

指數退避還沒做，L2 只完成一半。

### `ErrMaxRetries` 現在包住 racing error（L4）

```go
return fmt.Errorf("%w after %d attempts: %w", ErrMaxRetries, maxRetries, err)
```

原本直接 `return ErrMaxRetries`，實際在 race 的錯誤就這樣丟了。`handler.go:69` 把 `ErrMaxRetries` 和 `ErrConcurrentModification` 映到同一個 gRPC code，正是因為分不出來。現在 `errors.Is` 兩個 sentinel 都成立。

### `Snapshot()` 不再交出 aggregate 內部的指標（F4）

`BuyerID` / `SoldPrice` 是 snapshot 上僅有的兩個 nilable 欄位，原本直接交出 `l.buyerID` / `l.soldPrice`。`*snap.SoldPrice = 999` 就能改到 aggregate 裡面。註解寫著「no path to write fields」，bids 也確實逐欄複製過，只有這兩欄漏了。

改成複製 pointee 再指向副本。nil 還是 nil，sqlx 和 `diffListing` 那邊語意不變。

**沒有**改成 `Settlement *struct{BuyerID; Price}`。那才是型別層面的正解 —— 兩欄永遠一起 nil、一起有值，現在這條不變式沒人記錄，只是靠 `MarkSold` 是唯一寫入點在撐。但成交路徑在 saga 那輪要重畫，`PENDING_SETTLEMENT` 和 hold id 進來之後形狀不只兩欄，現在定死大概還要再改一次。留到那時候一起收，見 F4。

### 測試

三條新的，都做過反向驗證。第一次拆機制時只是編譯不過，等於沒驗到，重做了一次才確認是斷言失敗：

- `TestSnapshotDoesNotShareSettlementState` — 透過 snapshot 指標寫入不得影響 aggregate
- `TestWithRetry_ExhaustionWrapsTheRacingError` — 放棄時仍說得出誰在 race
- `TestWithRetry_StopsOnCancelledContext` — 取消後不再重試

---

## 併發控制：目前靠什麼擋

### OCC（樂觀鎖）

`listings` 有 `version` 欄位。`Save` 的 UPDATE 帶 `WHERE id = $x AND version = $expected`，影響 0 列就回 `ErrConcurrentModification`，`withRetry` 重新載入再試，最多 5 次。

`bids` 沒有 version 欄位。bid 一律透過 listing 寫入，OCC 守的是 listing 那一列。

有個細節值得知道：`Save` 在 `changes.IsEmpty()` 時提早 return，不會 bump version。純出價時 `newBids` 非空，所以 version 會正常遞增。wallet 的 `PlaceHold` 沒設 `updatedAt`，同樣的寫法在那邊風險比較高。

### Partial unique index

OCC 只守 `listings` 那一列。bid 的 INSERT 和 UPDATE 不在 `WHERE version` 的保護範圍內，所以「同時只有一個 WINNING」實際上是 `idx_bids_single_winner` 在守。

### 沒有 row lock

repo 裡沒有任何 `SELECT FOR UPDATE`、`FOR SHARE`、`pg_advisory_lock`、`SERIALIZABLE`。

`ExecTx` 的 `opts` 傳 `nil` 時走驅動預設，Postgres 是 `READ COMMITTED`。整個 `Save` 都在這個等級跑，只有唯讀的 `FindByID` 用 `REPEATABLE READ`。

熱門 listing 上這會退化成重試風暴。`withRetry` 的 jitter 是固定的 `[0, 5ms)`，沒有指數退避，五次重試全部落在 25ms 內。`wallet-service/SPECIFICATION.md:77` 已經把 row lock 列為預留的逃生口。

待改善見文末 L1–L3。L4 已修，jitter 現在也可以被 `ctx` 中斷，見上節。

---

## 冪等性：目前完全沒有

`docs/schema/bids.md` 和 `listings.md` 都寫了 `idempotency_key UUID NULL`，`SPECIFICATION.md:100` 也要求所有寫入端點都要帶 `Idempotency-Key` header。

實際上兩張表都沒有這個欄位，全 repo 沒有任何一張表有。也沒有任何 code 讀那個 header。

同一筆出價重送兩次就是兩筆 bid，第二筆把第一筆擠成 OUTBID。同一個人跟自己競標。

### repo 裡唯一能用的範例

notification-service 的 inbox pattern（`internal/notification/inbox_repository.go`）：

```go
INSERT INTO processed_events (event_id, event_type)
VALUES ($1, $2)
ON CONFLICT (event_id, event_type) DO NOTHING
```

`RowsAffected() == 1` 代表新事件，`0` 代表重送。去重標記和業務寫入在同一個交易裡，所以不會出現「標記了但業務沒做」。

`common/` 底下沒有 inbox package，只有 `ErrAlreadyProcessed` 這個 sentinel 孤零零放在 `constants/errors.go`。

### wallet 那邊的對照

`wallet_holds` 有 `UNIQUE(bid_id)`，schema 文件明白寫著這是 idempotency key。但 `PlaceHoldUC` 不會先查有沒有既存的 hold，重送時直接撞 unique violation，被 `WrapDBErr` 轉成 `ErrDuplicateResource`，最後變成 gRPC `AlreadyExists`。

方向是反的。冪等操作重送應該回成功，不是回錯誤，saga 參與者必須容忍 at-least-once 重送。

待改善見 I1–I3。

---

## TCC：PlaceBid 要呼叫 wallet 的 PlaceHold

`SPECIFICATION.md` 規劃的是 Try-Confirm-Cancel：

```
Try      PlaceHold    凍結買家的錢（RESERVED）
Confirm  CommitHold   成交時真的扣款（COMMITTED）
Cancel   ReleaseHold  被擠掉或撤回時退回（RELEASED）
```

目前 `PlaceBid` 完全沒碰 wallet。出價只改 marketplace 自己的資料庫，買家帳戶一毛錢都沒凍。

### 傳輸方式：以 spec 為準，走事件驅動

初稿的 T4 寫「marketplace → wallet 的 gRPC client」，跟 spec 不合。`marketplace-service/SPECIFICATION.md:66-70` 規定的是事件驅動：

```
Marketplace 建 Bid（PENDING）→ 發布 BidInitiated
→ wallet 下 hold → 發布 HoldCreated / HoldFailed
→ Marketplace 設 WINNING（並降級前任）或 FAILED
```

wallet 那側的 spec 也一致：AMQP consumer 是 primary 寫入路徑，gRPC 寫入路徑標 ⏳ PLANNED。

已定案照 spec 走。這對 `PENDING` 的意涵差很多：同步 gRPC 下它只活幾毫秒，幾乎不用落地；非同步下它是真的會滯留的狀態，要配 timeout 和對帳。

代價是 `common/outbox` 得在 marketplace 接上。目前只有 auth / game / stats 用了。不接的話「寫 bid」和「發 `BidInitiated`」不在同一交易裡，事件會掉。工程量比 gRPC 版大得多。

### wallet 那邊的準備狀況

| 階段 | domain verb | usecase | gRPC | 可用嗎 |
|---|---|---|---|---|
| Try | `PlaceHold` ✅ | ✅ | ✅ | 可以呼叫 |
| Confirm | `CommitHold` ✅ | ✅ | 有 RPC 但 handler 會 panic | 不可用 |
| Cancel | 不存在 | 不存在 | 沒有 RPC | 不可用 |

**`ReleaseHold` 整個不存在。** FSM 白名單裡有 `StatusReserved → StatusReleased`，`StatusReleased` 常數也定義了，spec 明文要求它而且要冪等。但 `account.go` 裡只有 `PlaceHold`、`Deposit`、`Withdraw`、`CommitHold` 四個 verb。

沒有它，被擠掉的出價者錢就永遠凍著。`wallet_holds.expired_at` 有 1 小時的過期時間，但沒有 sweeper 去掃。這直接違反 spec 的「no value leaks」。

**`CommitHold` 的 handler 會 panic。** `Handler` struct 宣告了 `commitHoldUC` 欄位，但 `NewHandler` 只收三個參數、從沒指派它，`NewCommitHoldUC` 全 repo 也沒有任何呼叫點。任何 CommitHold RPC 都會 nil pointer dereference。

**`wallet.proto` 沒有 `ReleaseHold` 和 `Credit` RPC。** 補償路徑在線路協定上根本無法表達。

### marketplace 這邊還沒有的東西

- 沒有 wallet 的 gRPC client（`marketplace-service/` 底下沒有 outbound `grpc/` 目錄）
- 沒有 `place_bid_usecase.go`
- `internal/config/services.go:22` 有一行註解掉的 `// placeHoldUC := usecase.NewPlaceHoldUC(listingRepo)`

既有的 outbound client 範例可以參考 `game-service/grpc/items/client.go`：持有 `discovery.Registry`，每次呼叫 `discovery.ServiceConnection` 解析、用完 `defer conn.Close()`。缺點是每次都重新撥接，出價這種熱路徑要考慮連線重用。

### bids 表撐不起 saga

`status` 的 CHECK 只有 `WINNING / OUTBID / WON / CANCELLED`。saga 需要的中間狀態沒有：

```
建立 bid（PENDING）→ 呼叫 wallet PlaceHold
    成功 → WINNING
    失敗 → FAILED
```

`PENDING` 和 `FAILED` 都不在 CHECK 裡。下個 PR 做 saga 之前，這張表要先改。

待改善見 T1–T4。

---

## Sentinel errors

| Sentinel | 情境 |
|---|---|
| `ErrInvalidAmount` | `amount <= 0` |
| `ErrBidTooLow` | 沒達到門檻 |
| `ErrListingNotAcceptingBids` | listing 不是 `ACTIVE` |
| `ErrListingExpired` | 超過 `endsAt` |
| `ErrBidNotFound` | 這個 listing 沒有那筆 bid |
| `ErrNotBidOwner` | 想撤別人的 bid |
| `ErrInvalidBidTransition` | FSM 擋下的非法轉換 |

一律回 sentinel，不回 generic error。handler 的 `mapError` 靠 `errors.Is` 分流成對應的 gRPC code。

---

## 驗證方式

```bash
cd game-server/marketplace-service
go test ./internal/listing/... -v
```

16 條 domain 測試 + 4 條 `withRetry` 測試。domain 這側有兩條是核心：

- `TestSingleWinnerInvariant`：連下三筆遞增出價，永遠只有一筆 WINNING，前兩筆是 OUTBID 而非被刪除
- `TestBidBelowCurrentPriceIsNotCreated`：低於門檻時同時斷言「回傳錯誤」和「bids 數量沒變」

每條測試都做過反向驗證，把它守的機制拆掉，確認測試會轉紅。綠燈本身不代表測試有價值。

repository 層另外做過端對端寫入真實資料庫的驗證：兩筆 bid 正確持久化、輸家降級、version 遞增、過期 version 被 OCC 擋下。

---

## 待改善清單

saga 本身留給下個 PR。底下這些是它的前置條件，沒有先做 saga 沒辦法正確運作。

### 冪等（優先）

| # | 項目 | 說明 |
|---|---|---|
| I1 | `bids.idempotency_key` | 加欄位 + `UNIQUE`。schema 文件已經寫了，migration 沒實作 |
| I2 | `PlaceBid` 支援重送 | 同一個 key 進來回既有的 bid，不是建新的也不是報錯 |
| I3 | wallet `PlaceHold` 改成成功冪等 | 現在重送回 `AlreadyExists`。應該查到既有 hold 就回成功 |

I1 沒做的話，網路重試會讓同一個人跟自己競標。

### TCC 前置（saga 的擋路石）

T1、T2 和上表的 I3 都在 wallet-service 內，這邊不動，轉成 issue 交給該服務的維護者。T1 要新增 domain verb、usecase、proto RPC 三層，而 `wallet.proto` 是跨服務契約。

| # | 項目 | 說明 |
|---|---|---|
| T1 | wallet `ReleaseHold` | domain verb、usecase、proto RPC 全部都要新增。沒有它就沒有補償路徑 |
| T2 | 修 `CommitHold` handler 的 nil panic | `NewHandler` 補上 `commitHoldUC` 參數，`services.go` 呼叫 `NewCommitHoldUC` |
| T3 | `bids.status` 加 `PENDING` / `FAILED` | 現在的 CHECK 表達不了 saga 的中間狀態 |
| T4 | marketplace → wallet 的**事件**串接 | 初稿寫的是 gRPC client，已改判：依 spec 走 `BidInitiated` / `HoldCreated` / `HoldFailed`。前置是 `common/outbox` 在 marketplace 接線，否則事件會掉 |

T1 是其中最重要的。目前被擠掉的出價者，錢會永遠凍在 hold 裡。

### 併發

| # | 項目 | 說明 |
|---|---|---|
| L1 | 熱門 listing 的 row lock | `SELECT ... FOR UPDATE` 或 `SERIALIZABLE`。spec 已列為預留方案 |
| L2 | `withRetry` 加指數退避 | 做一半。jitter 可以被 `ctx` 中斷了，但仍是固定 `[0,5ms)`，五次重試擠在 25ms 內 |
| L3 | `withRetry` 抽到 `common/` | 兩份**已經不一樣了**。marketplace 這份加了 `ctx` 和 error wrap，wallet 沒有。要抽共用得先決定 wallet 跟不跟 |
| L4 | `ErrMaxRetries` 包住原始錯誤 | 已修 |

L1 要有真實流量數據再決定。OCC 在低競爭下比 lock 好，高競爭才會反過來。

### 功能面

| # | 項目 | 說明 |
|---|---|---|
| F1 | 讀側 `current_price` | 買家看不到目前喊到多少。公式已在 domain 的 `currentPrice()` |
| F2 | gRPC 接線 | `PlaceBid` / `WithdrawBid` 還沒有 RPC |
| F3 | BUYOUT | `Listing` 沒有 `buyout_price` 欄位，spec 要求的驗證無處可放 |
| F4 | `ListingSnapshot` 收斂成 `Settlement` | 洩漏已修（複製 pointee）。剩下的是把 `BuyerID` / `SoldPrice` 併成一個 optional 值，讓「兩欄永遠同時 nil」變成型別保證，不再是默契。排在 saga 那輪，成交路徑那時本來就要重畫 |
| F5 | hold 過期 sweeper | `expired_at` 目前是無效資料，沒有背景工作在掃 |

### 為什麼撤回領先者不把亞軍拉回來

拍賣直覺上應該讓第二名遞補。但一旦出價連動 wallet hold：

```
領先者撤回 → 他的 hold 釋放
亞軍的 hold 早在被擠掉時就釋放了
拉回亞軍 → 這筆領先出價背後沒有錢
```

正確做法要重新對亞軍下 hold，那是 saga 的事。目前撤回後 listing 暫時沒有領先者，`currentPrice()` 掉回底價。單一贏家不變式仍然成立，零個也合法。

---

## 給協作者的提醒

`000001_create_listings_table.up.sql` 被改寫過，而非新增 migration。

任何資料庫跑過舊版的人，golang-migrate 會認定 version 1 已完成而不重跑，改寫的內容從未套用。症狀會出現在無關的地方，我是在 `bids` 的 FK 建不起來時才發現的，舊表的 `id` 是 `VARCHAR(36)` 不是 `UUID`。

若撞到，清掉 `schema_migrations` 重跑即可（表是空的）。長期建議用新 migration 修正，不要改寫歷史。

---

## 這份文件的待辦

repo 已有既定的文件路由，見 `CLAUDE.md` §Spec & docs routing。這份 outline 的內容按規矩應該拆到：

- 能力清單 → `marketplace-service/SPECIFICATION.md` 的 thin line
- 深入設計與 API surface → `docs/specs/NNNN-*.md`
- 「Bid 為何是 entity」「UPDATE 為何先於 INSERT」 → `docs/adr/`
- Bid / WINNING / OUTBID 詞彙 → `marketplace-service/CONTEXT.md`（目前仍是空白樣板）

拆分前以本文為準，拆分後本文改為純索引。
