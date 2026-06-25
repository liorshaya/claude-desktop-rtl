<p align="center">
  <img src="assets/claude-desktop-rtl-banner.svg" alt="Claude Desktop RTL" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <b>עברית</b> &nbsp;·&nbsp; <a href="README.ar.md">العربية</a>
</p>

<p align="center">
  <i>RTL חלק (עברית · ערבית · פרסית) ל‑<b>Claude Desktop</b> ול‑<b>claude.ai</b> — ממנוע אחד טהור.</i>
</p>

<p align="center">
  <img alt="Platform" src="https://img.shields.io/badge/desktop-macOS%2013%2B-000000?logo=apple&logoColor=white">
  <img alt="Browser" src="https://img.shields.io/badge/browser-any%20OS%20(userscript)-4c9a2a">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6">
  <img alt="Network" src="https://img.shields.io/badge/network-zero-16a34a">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-d4572a">
</p>

<div dir="rtl" align="right">

---

Claude כותב עברית וערבית יפות — אבל מרנדר אותן **משמאל לימין**: נקודות בצד הלא נכון, סימני פיסוק שקופצים לקצה השורה, טבלאות שזורמות הפוך. **Claude RTL** מתקן את זה בכל מקום שבו Claude רץ, **בלי לגעת בטקסט שלך ובלי לגעת ברשת**.

## למה זה שונה

- 🎯 **כיוון per-block, כמו שצריך.** כל פסקה, רשימה, טבלה וציטוט מחליטים על הכיוון של **עצמם** לפי התוכן של **עצמם**. בלוקים באנגלית נשארים LTR ובלוקים בעברית מתהפכים RTL — **באותו מסמך**, בלי היפוך גלובלי (הבאג שיש לכל כלי אחר).
- 🔒 **אפס רשת. אפס טלמטריה. אפס אחסון נתונים.** השיחות שלך לא עוזבות את המחשב. העתקה ו‑Ctrl-F נשארים **בייט‑לבייט** — לעולם לא מזריקים תווי יוניקוד נסתרים.
- 🛡️ **בטוח מעצם הבנייה.** ה‑Claude המקורי שלך **לעולם לא משתנה**. אנחנו מתקנים עותק נפרד, והוא **שורד עדכוני Claude אוטומטית**.
- 🖥️ **דסקטוp *וגם* דפדפן, מנוע אחד.** אפליקציית menu-bar בקליק ל‑Claude Desktop, ו‑userscript ל‑claude.ai בכל דפדפן — חולקים בדיוק את אותו מנוע bidi.
- 🧪 **ליבה טהורה ובדוקה.** האינטליגנציה (`engine/`) נטולת‑DOM ומכוסה ב‑corpus של מקרי קצה, מנותקת מאופן ההפצה.

## מה זה מטפל

| משטח | התנהגות |
|---|---|
| Prose (פסקאות, כותרות) | כיוון per-block לפי first-strong של הדפדפן |
| רשימות (כולל מקוננות) | markers + הזחה בצד התוכן; כיוון חכם לכל פריט |
| טבלאות | סדר העמודות לפי הכותרת; כל תא מתיישר לטבלה |
| ציטוטים | הפס/הזחה עוברים לצד התוכן |
| מספרים, מטבע, %, תאריכים | מסודרים נכון; לעולם לא כופים שורה עברית ל‑LTR |
| חצים (`→`) ב‑RTL | מתהפכים ויזואלית — התו עצמו לא משתנה |
| בלוקי קוד | נשארים **LTR** במכוון (RTL היה משבר תחביר) |
| תיבות קלט/עריכה | `dir="auto"`, מיידי, בלי ריצוד |
| מסמך מעורב אנגלית/עברית | כל בלוק מחליט לעצמו — בלי היפוך גלובלי |

## 🚀 התקנה

### macOS Desktop — הדרך הקלה (מומלץ)

אפליקציית menu-bar מתקינה ומעדכנת RTL בקליק. האפליקציה הבנויה **לא צריכה Node ולא טרמינל**.

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl/gui && ./build.sh          # בנייה חד-פעמית (צריך Node + Xcode CLT)
open "dist/Claude RTL.app"
```

ואז, מתוך האפליקציה:
1. לחץ **Install RTL** — היא מתקנת עותק ב‑`~/Applications/Claude-RTL.app`.
2. macOS יבקש סיסמת keychain פעם אחת → **Always Allow** *(המחשב שלך, ה‑keychain שלך)*.
3. לחץ **Open Claude-RTL**. זהו — RTL חלק.

הפעל את **“Keep RTL after Claude updates”** והוא יחיל את עצמו מחדש בכל עדכון של Claude.

> ה‑Claude המקורי ב‑`/Applications` לעולם לא נגע. “Open Claude-RTL” סוגר קודם את המקורי (הם לא יכולים לרוץ יחד). חלון ראשון לבן? צא (⌘Q) ופתח שוב.

### דפדפן — claude.ai (כל מערכת הפעלה)

עובד ב‑Chrome, Edge, Firefox, Safari — בכל מקום עם מנהל userscript.

```bash
npm run build            # בונה dist/claude-rtl.user.js
```

1. התקן **Tampermonkey** (או Violentmonkey).
2. פתח את `dist/claude-rtl.user.js` והתקן (או הדבק את התוכן בסקריפט חדש).
3. בתוסף, הפעל **“Allow User Scripts”** (דרישה של Chrome/Edge).
4. רענן את `claude.ai`.

### CLI — מתקדם (macOS)

```bash
desktop/patch.sh --install      # patch (בניית עותק + הזרקת RTL)
desktop/patch.sh --watch        # החלה אוטומטית בעדכוני Claude
desktop/patch.sh --status       # מצב מקורי / מתוקן / watcher
desktop/patch.sh --uninstall    # הסרת העותק (המקורי לא נגע)
```

## 🧠 איך זה עובד

הדפדפן כבר מריץ אלגוריתם Bidi מלא של יוניקוד. אנחנו לא ממשים אותו מחדש — אנחנו עושים את **החלטות הכיוון והבידוד** ונותנים ל‑renderer לסדר. CSS `unicode-bidi: plaintext` לכל leaf block הוא מנגנון‑הבסיס היחיד ל‑prose, כך שכל בלוק מחליט לעצמו והקונטיינר לעולם לא מתהפך. אפליקציית הדסקטוp מזריקה את אותו מנוע ל‑renderer של Claude ומהפכת רק את כיוון חלון‑הכרום ב‑main process.

עיצוב מלא: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## ⚠️ מגבלות (v1)

- **בלוקי קוד אמיתיים נשארים LTR** (במכוון — RTL משבר סוגריים, הזחה, אופרטורים).
- **Artifacts בדסקטוp** מרונדרים ב‑iframe צולב‑origin שה‑payload של הדסקטוp עוד לא נכנס אליו (ה‑userscript בדפדפן כן מכסה אותם).
- **אין עדיין פונט עברי מוטמע** — macOS ממילא מרנדר עברית עם פונטי מערכת.
- הרשימה המלאה ב‑**[ARCHITECTURE.md §15](ARCHITECTURE.md)**.

## 🤝 תרומה

PRs יתקבלו בשמחה — זה open source. ראה **[CONTRIBUTING.md](CONTRIBUTING.md)**, וכש‑Claude משנה את ה‑DOM שלו, ה‑**[runbook לאימוץ גרסת Claude חדשה](docs/RUNBOOK-adopt-new-claude-version.md)** מראה בדיוק איך לעדכן את ה‑selectors.

## 📄 רישיון

[MIT](LICENSE) © Lior Shaya

</div>
