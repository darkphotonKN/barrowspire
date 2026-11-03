package notification

import (
	"bytes"
	"fmt"
	htmltemplate "html/template"
	"text/template"

	commonconstants "github.com/darkphotonKN/barrowspire-server/common/constants"
)

type NotificationTemplate struct {
	Title            string
	MessageTemplate  string   // 可以用 {{.Name}} 這種 placeholder
	NotificationType string   // "in_app", "email", "push"
	DataFields       []string // 需要的額外資料欄位
}

var NotificationTemplates = map[string]NotificationTemplate{
	"member.signedup": {
		Title:            "Welcome to The Era of Barrowspire!",
		MessageTemplate:  "Hi {{.Name}}, welcome! Your account {{.Email}} has been created.",
		NotificationType: "in_app",
		DataFields:       []string{"email", "signedUpAt"},
	},
	"match.ended": {
		Title:            "Game Over",
		MessageTemplate:  "Your game has ended! {{.Result}}. Kills: {{.Kills}}, Deaths: {{.Deaths}}",
		NotificationType: "in_app",
		DataFields:       []string{"matchId", "result", "kills", "deaths"},
	},
	"item.acquired": {
		Title:            "New Item Acquired",
		MessageTemplate:  "Congratulations! You obtained {{.ItemName}}",
		NotificationType: "in_app",
		DataFields:       []string{"itemId", "itemName", "rarity"},
	},
}

// RenderTemplate 根據 event type 和 data 渲染通知內容
func RenderTemplate(eventType string, data map[string]any) (title, message string, notificationType string, err error) {
	tmpl, exists := NotificationTemplates[eventType]
	if !exists {
		return "", "", "", fmt.Errorf("template not found for event type: %s", eventType)
	}

	// 使用 Go template 渲染訊息
	t, err := template.New("message").Parse(tmpl.MessageTemplate)
	if err != nil {
		return "", "", "", err
	}

	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", "", "", err
	}

	return tmpl.Title, buf.String(), tmpl.NotificationType, nil
}

// verificationSubject is the subject of every verification mail (FS-V6SFK R25).
const verificationSubject = "Your Barrowspire verification code"

var verificationText = template.Must(template.New("verification.txt").Parse(`Hi {{.Name}},

Your Barrowspire verification code is:

    {{.Code}}

It expires in 15 minutes. If you didn't ask for this code, you can ignore this email.
`))

// html/template escapes the member's name, which is free text they chose.
var verificationHTML = htmltemplate.Must(htmltemplate.New("verification.html").Parse(`<!doctype html>
<html>
  <body style="font-family: sans-serif; color: #222;">
    <p>Hi {{.Name}},</p>
    <p>Your Barrowspire verification code is:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px;">{{.Code}}</p>
    <p>It expires in 15 minutes. If you didn't ask for this code, you can ignore this email.</p>
  </body>
</html>
`))

// verificationMail renders the mail carrying a member's verification code
// (FS-V6SFK R25).
func verificationMail(payload *commonconstants.MemberVerificationRequestedEventPayload) (Mail, error) {
	data := struct{ Name, Code string }{Name: payload.Name, Code: payload.Code}

	var text, html bytes.Buffer
	if err := verificationText.Execute(&text, data); err != nil {
		return Mail{}, fmt.Errorf("render verification text: %w", err)
	}
	if err := verificationHTML.Execute(&html, data); err != nil {
		return Mail{}, fmt.Errorf("render verification html: %w", err)
	}

	return Mail{
		To:      payload.Email,
		Subject: verificationSubject,
		Text:    text.String(),
		HTML:    html.String(),
	}, nil
}
