<p align="center">
  <img src="../assets/claude-desktop-rtl-banner.svg" alt="Claude Desktop RTL" width="100%">
</p>

<p align="center">
  <a href="../README.md"><img src="../assets/language/btn-english.svg" alt="English" height="36"></a>
  &nbsp;
  <img src="../assets/language/btn-hebrew-active.svg" alt="עברית" height="36">
  &nbsp;
  <a href="README.ar.md"><img src="../assets/language/btn-arabic.svg" alt="العربية" height="36"></a>
</p>

<p align="center">
  <i>RTL חלק (עברית · ערבית · פרסית) ל‑<b>Claude Desktop</b> ול‑<b>claude.ai</b> — ממנוע אחד טהור.</i>
</p>

<p align="center">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D6?logo=windows&logoColor=white">
  <img alt="Browser" src="https://img.shields.io/badge/browser-any%20OS%20(userscript)-4c9a2a">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6">
  <img alt="Network" src="https://img.shields.io/badge/network-zero-16a34a">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-d4572a">
</p>

<div dir="rtl" align="right">

---

Claude כותב עברית וערבית יפות — אבל מרנדר אותן **משמאל לימין**: נקודות בצד הלא נכון, סימני פיסוק שקופצים לקצה השורה, טבלאות שזורמות הפוך. **Claude RTL** מתקן את זה בכל מקום שבו Claude רץ, **בלי לגעת בטקסט שלך ובלי לגעת ברשת**.

<p align="center">
  <img src="../assets/language/claude-rtl-comparison.png" alt="אותה תשובה של Claude בלי ועם Claude RTL — טבלאות, רשימות וטקסט עברי מרונדרים משמאל לימין (שבור) מול ימין לשמאל (תקין)" width="92%">
</p>

<p align="center">
  <sub><b>בלי</b> RTL אותה תשובה מרונדרת משמאל לימין — עמודות טבלה הפוכות, פיסוק בצד הלא נכון. <b>איתו</b>, כל בלוק נקרא נכון.</sub>
</p>

## למה זה שונה

- 🎯 **כיוון per-block, כמו שצריך.** כל פסקה, רשימה, טבלה וציטוט מחליטים על הכיוון של **עצמם** לפי התוכן של **עצמם**. בלוקים באנגלית נשארים LTR ובלוקים בעברית מתהפכים RTL — **באותו מסמך**, בלי היפוך גלובלי (הבאג שיש לכל כלי אחר).
- 🔒 **אפס רשת. אפס טלמטריה. אפס אחסון נתונים.** השיחות שלך לא עוזבות את המחשב. העתקה ו‑Ctrl-F נשארים **בייט‑לבייט** — לעולם לא מזריקים תווי יוניקוד נסתרים.
- 🛡️ **בטוח מעצם הבנייה.** ה‑Claude המקורי שלך **לעולם לא משתנה**. אנחנו מתקנים עותק נפרד, והוא **שורד עדכוני Claude אוטומטית**.
- 🖥️ **דסקטופ *וגם* דפדפן, מנוע אחד.** אפליקציית menu-bar ב‑macOS ואפליקציית tray ב‑Windows ל‑Claude Desktop, וגם userscript ל‑claude.ai בכל דפדפן — כולם חולקים בדיוק את אותו מנוע bidi.
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

## ✅ פלטפורמות נתמכות

| משטח | דרישות |
|---|---|
| 🍎 **macOS Desktop** | macOS 13 (Ventura) ומעלה. ה‑`.dmg` המוכן הוא ל‑Apple Silicon; מחשבי Intel יכולים לבנות מהמקור. |
| 🪟 **Windows Desktop** | Windows 10 או 11 (64‑bit). מתקן **את שתי** ההתקנות של Claude — גם המתקין הקלאסי מ‑claude.ai וגם גרסת ה‑Microsoft Store (MSIX). |
| 🌐 **דפדפן — claude.ai** | כל מערכת הפעלה. Chrome, Edge, Firefox או Safari עם מנהל userscript. |

## 🚀 התקנה

<p align="center">
  <img src="../assets/language/claude-rtl-showcase.png" alt="המנהל של Claude RTL — אפליקציית menu-bar ב‑macOS ואפליקציית tray ב‑Windows, שתיהן מציגות ‏“RTL is active”" width="80%">
</p>

<p align="center">
  <sub>המנהל בקליק אחד — ב‑<b>macOS</b> (שורת התפריט) וב‑<b>Windows</b> (שורת המשימות). מתקין, מעדכן אוטומטית ומסיר RTL, בלי טרמינל.</sub>
</p>

### macOS Desktop — הדרך הקלה (מומלץ)

אפליקציית menu-bar מתקינה, מעדכנת ומסירה RTL בקליק. **לא צריכה Node ולא טרמינל**.

**אפשרות א׳ — הורדת האפליקציה** (הכי מהיר)

1. הורד את **`Claude-RTL.dmg`** מ‑[הגרסה האחרונה](https://github.com/liorshaya/claude-desktop-rtl/releases/latest).
2. פתח וגרור את **Claude RTL** לתוך **Applications**.
3. *בפתיחה הראשונה בלבד:* קליק‑ימני על האפליקציה → **Open** → **Open**. *(macOS Sequoia: System Settings → Privacy & Security → “Open Anyway”.)* הצעד החד‑פעמי הזה קיים כי האפליקציה open-source וחתומה ad-hoc, לא notarized של Apple — אפשרות ב׳ עוקפת אותו לגמרי.

**אפשרות ב׳ — בנייה מהמקור** (בלי אזהרת Gatekeeper)

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl/gui && ./build.sh          # בנייה חד-פעמית (צריך Node + Xcode CLT)
open "dist/Claude RTL.app"
```

ואז, מתוך האפליקציה:
1. לחץ **Install RTL** — היא מתקנת עותק ב‑`~/Applications/Claude-RTL.app`.
2. macOS יבקש סיסמת keychain פעם אחת → **Always Allow** *(המחשב שלך, ה‑keychain שלך)*.
3. לחץ **Open Claude-RTL**. זהו — RTL חלק.

הפעל את **“Keep RTL after Claude updates”** והוא יחיל את עצמו מחדש בכל עדכון של Claude. **Check for updates** (תחת *Details*) מושך גרסאות חדשות של האפליקציה עצמה.

> ה‑Claude המקורי ב‑`/Applications` לעולם לא נגע. “Open Claude-RTL” סוגר קודם את המקורי (הם לא יכולים לרוץ יחד). חלון ראשון לבן? צא (⌘Q) ופתח שוב.

### Windows Desktop

אפליקציית tray מתקינה, מעדכנת ומסירה RTL — **בלי Node, בלי טרמינל, ובלי להתקין שום דבר מראש** (runtime נייד מצורף למתקין).

1. הורד את **`ClaudeRTL-Setup.exe`** מ‑[הגרסה האחרונה](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) והרץ. זו התקנה **per-user** — בלי הרשאות מנהל.
2. הפעל את **Claude RTL** מתפריט ההתחלה ולחץ על הכפתור כדי לתקן את Claude. האפליקציה מזהה איך Claude מותקן ומחילה RTL במקום, עם גיבוי המקור קודם.
3. פתח את Claude — עברית, ערבית ופרסית מרונדרות RTL.

הפעל את **“Keep RTL after Claude updates”** והוא יחיל את עצמו מחדש אוטומטית אחרי כל עדכון של Claude.

> עובד עם **שתי** ההתקנות: גם ה‑`.exe` הקלאסי מ‑claude.ai וגם גרסת ה‑Microsoft Store (MSIX). בגרסת ה‑Store, החלת RTL מבקשת **אישור מנהל** חד‑פעמי (UAC) — היא חותמת מחדש את Claude עם תעודה מקומית כדי ש‑Cowork ימשיך לעבוד, ו‑**“Restore original” מחזיר הכול לקדמותו**. המקור תמיד מגובה.

מעדיף שורת פקודה? צינור ה‑PowerShell מתועד ב‑**[desktop/windows/README.md](../desktop/windows/README.md)**.

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

PRs יתקבלו בשמחה — זה open source. ראה **[CONTRIBUTING.md](../CONTRIBUTING.md)**, וכש‑Claude משנה את ה‑DOM שלו, ה‑**[runbook לאימוץ גרסת Claude חדשה](RUNBOOK-adopt-new-claude-version.md)** מראה בדיוק איך לעדכן את ה‑selectors.

## 📄 רישיון

[MIT](../LICENSE) © Lior Shaya

</div>
