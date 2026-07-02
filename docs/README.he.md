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
  <a href="https://github.com/liorshaya/claude-desktop-rtl/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/liorshaya/claude-desktop-rtl?label=release&color=d4572a"></a>
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6">
  <img alt="macOS" src="https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D6?logo=windows&logoColor=white">
  <img alt="Browser" src="https://img.shields.io/badge/browser-any%20OS%20(userscript)-4c9a2a">
  <img alt="Network" src="https://img.shields.io/badge/network-zero-16a34a">
</p>

<div dir="rtl" align="right">

---

**Claude RTL גורם לעברית, ערבית ופרסית להתרנדר נכון — מימין לשמאל — בכל מקום שבו Claude רץ, בלי לגעת בטקסט שלך ובלי לגעת ברשת.** בלי זה, Claude כותב עברית יפה ואז מציג אותה משמאל לימין: נקודות בצד הלא נכון, פיסוק שקופץ לקצה השורה, טבלאות שזורמות הפוך.

<p align="center">
  <img src="../assets/language/claude-rtl-comparison.png" alt="אותה תשובה של Claude בלי ועם Claude RTL — טבלאות, רשימות וטקסט עברי מרונדרים משמאל לימין (שבור) מול ימין לשמאל (תקין)" width="92%">
</p>

<p align="center">
  <sub><b>בלי</b> Claude RTL התשובה מרונדרת משמאל לימין — עמודות טבלה הפוכות, פיסוק בצד הלא נכון. <b>איתו</b>, כל בלוק נקרא נכון.</sub>
</p>

## למה זה חשוב

- 🎯 **כיוון לכל בלוק, כמו שצריך.** כל פסקה, רשימה, טבלה וציטוט מחליטים על הכיוון של **עצמם** לפי התוכן של **עצמם**. בלוקים באנגלית נשארים LTR ובלוקים בעברית מתהפכים RTL — **באותו מסמך**, בלי היפוך גלובלי (הבאג שיש לכל כלי אחר).
- 🔒 **אפס רשת. אפס טלמטריה. אפס אחסון נתונים.** השיחות שלך לא עוזבות את המחשב. העתקה ו‑Ctrl-F נשארים **בייט‑לבייט** — לעולם לא מוזרקים תווי יוניקוד נסתרים.
- 🛡️ **בטוח מעצם הבנייה.** ב‑macOS ה‑Claude המקורי **לעולם לא משתנה** (נבנה עותק מתוקן נפרד); ב‑Windows המקור **מגובה קודם** וקליק אחד משחזר אותו.
- 🖥️ **דסקטופ *וגם* דפדפן, מנוע אחד.** אפליקציית שורת‑תפריט ב‑macOS, אפליקציית מגש (tray) ב‑Windows, ו‑userscript ל‑claude.ai בכל דפדפן — כולם חולקים בדיוק את אותו מנוע bidi.
- 🧪 **ליבה טהורה ובדוקה.** אינטליגנציית ה‑bidi‏ (`engine/`) נטולת‑DOM ומכוסה ב‑corpus של מקרי קצה, מנותקת מאופן ההפצה.

## ✅ פלטפורמות נתמכות

| פלטפורמה | דרישות |
|---|---|
| 🍎 **macOS Desktop** | macOS 13 (Ventura) ומעלה. ה‑`.dmg` המוכן הוא ל‑Apple Silicon; מחשבי Intel בונים מהמקור. |
| 🪟 **Windows Desktop — המתקין מ‑claude.ai** | Windows 10 / 11 (‏64‑bit), Claude שהותקן מ‑claude.ai (ה‑`.exe` הקלאסי). |
| 🏪 **Windows Desktop — Microsoft Store** | Windows 10 / 11 (‏64‑bit), Claude מחנות Microsoft‏ (MSIX). אישור מנהל חד‑פעמי. |
| 🌐 **דפדפן — claude.ai** | כל מערכת הפעלה. Chrome‏, Edge‏, Firefox או Safari עם מנהל userscript. |

## 🚀 התקנה

<p align="center">
  <img src="../assets/language/claude-rtl-showcase.png" alt="המנהל של Claude RTL — אפליקציית שורת-תפריט ב-macOS ואפליקציית מגש ב-Windows, שתיהן מציגות “RTL is active”" width="80%">
</p>

<p align="center">
  <sub>המנהל בקליק אחד — ב‑<b>macOS</b> (שורת התפריט) וב‑<b>Windows</b> (המגש). מתקין, מעדכן אוטומטית ומסיר RTL, בלי טרמינל.</sub>
</p>

### 🍎 macOS

1. הורידו את ה‑**`.dmg`** מ‑[הגרסה האחרונה](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) וגררו את **Claude RTL** לתוך **Applications**.
2. *בפתיחה הראשונה בלבד:* קליק‑ימני על האפליקציה → **Open** → **Open** *(ב‑macOS Sequoia‏: System Settings ‏← Privacy & Security ‏← “Open Anyway”)*. חד‑פעמי, כי האפליקציה חתומה ad-hoc ולא עברה notarization של Apple.
3. לחצו **Install RTL**. macOS יבקש סיסמת keychain פעם אחת → **Always Allow**.
4. לחצו **Open Claude-RTL**.

**שורת פקודה** (מקבילה, או לבניית האפליקציה בעצמכם — דורש Node ו‑Xcode CLT):

<div dir="ltr">

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
desktop/patch.sh --install     # builds a patched copy at ~/Applications/Claude-RTL.app
desktop/patch.sh --status      # verify
# GUI app instead: cd gui && ./build.sh && open "dist/Claude RTL.app"
```

</div>

**✔ התוצאה הצפויה:** התג באפליקציה מציג **“RTL is active”**, ו‑`--status` מדפיס `patched : ~/Applications/Claude-RTL.app (v…) — installed`. ה‑Claude המקורי ב‑`/Applications` לעולם לא נגוע.

### 🪟 Windows — הותקן מ‑claude.ai

1. הורידו את **`ClaudeRTL-Setup-…-win-x64.exe`** מ‑[הגרסה האחרונה](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) והריצו — התקנה **per-user**, בלי הרשאות מנהל ובלי שום דרישה מוקדמת (‏runtime נייד מצורף למתקין).
2. הפעילו את **Claude RTL** מתפריט ההתחלה ולחצו **Install RTL**. המקור מגובה קודם אל `‎*.crtl-bak`.
3. פתחו את Claude.

**שורת פקודה** (מקבילה — דורשת Node כשמריצים מתוך checkout של git):

<div dir="ltr">

```powershell
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
powershell -ExecutionPolicy Bypass -File .\desktop\windows\preflight.ps1   # readiness check (read-only)
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1       # apply RTL in place
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Status
```

</div>

**✔ התוצאה הצפויה:** התג במגש מציג **“RTL is active”**, ו‑`-Status` מדפיס `patched : True  (payload marker in app.asar)`.

### 🏪 Windows — Microsoft Store (MSIX)

1. אותו מתקין ואותה אפליקציית מגש כמו למעלה — היא **מזהה לבד** התקנה מהחנות.
2. לחצו **Install RTL** ואשרו את בקשת ה‑**מנהל** החד‑פעמית (UAC). היא חותמת מחדש את Claude עם תעודה מקומית כדי ש‑**Cowork ימשיך לעבוד**; **Restore original** מחזיר הכול לקדמותו.
3. פתחו את Claude.

**שורת פקודה** (מקבילה — מריצים מ‑PowerShell **מוגבה** (Run as administrator), דורשת Node מ‑checkout של git):

<div dir="ltr">

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1          # apply (admin)
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1 -Verify  # read-only check
```

</div>

**✔ התוצאה הצפויה:** ‏`-Verify` מדפיס `RTL injected (asar marker)   : True` ומאשר את שורות התעודה — ו‑Cowork ממשיך לעבוד.

### 🌐 דפדפן — claude.ai (כל מערכת הפעלה)

1. התקינו **Tampermonkey** (או Violentmonkey) והפעילו בתוסף **“Allow User Scripts”** (דרישה של Chrome/Edge).
2. בנו את ה‑userscript (דורש Node):

<div dir="ltr">

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
npm run build            # builds dist/claude-rtl.user.js
```

</div>

3. פתחו את `dist/claude-rtl.user.js` והתקינו אותו (או הדביקו את התוכן בסקריפט חדש ב‑Tampermonkey).
4. רעננו את `claude.ai`.

**✔ התוצאה הצפויה:** תשובות בעברית ובערבית ב‑claude.ai נקראות מיד מימין לשמאל — כולל בתוך פאנל ה‑Artifacts.

## 🧰 כל השאר

<details>
<summary><b>📋 מה זה מטפל</b> — רשימת המשטחים המלאה</summary>

| משטח | התנהגות |
|---|---|
| טקסט רץ (פסקאות, כותרות) | כיוון בסיס לכל בלוק לפי ה‑first-strong של הדפדפן |
| רשימות (כולל מקוננות) | סימוני הרשימה וההזחה נצמדים לצד התוכן; כיוון חכם לכל פריט |
| טבלאות | סדר העמודות לפי רוב התוכן; כל עמודה מיושרת לשפה שלה |
| ציטוטים | הפס וההזחה עוברים לצד התוכן |
| מספרים, מטבע, %, תאריכים | מסודרים נכון; לעולם לא כופים על שורה עברית LTR |
| השוואות (`3 < 5`) ומספרים עם סימן (`-5`) | מבודדים כך שהמתמטיקה לעולם לא נקראת הפוך |
| חצים (`→`) ב‑RTL | מתהפכים ויזואלית — התו עצמו לא משתנה |
| בלוקי קוד | נשארים **LTR** במכוון (RTL היה משבש תחביר) |
| תיבות קלט/עריכה | ‏`dir="auto"`, מיידי, בלי ריצוד |
| מסמך מעורב אנגלית/עברית | כל בלוק מחליט לעצמו — בלי היפוך גלובלי |

</details>

<details>
<summary><b>🔁 שמירה על RTL אחרי עדכוני Claude</b> — מנגנון ההחלה‑מחדש האוטומטי</summary>

עדכון של Claude מחליף את הקבצים ומוחק כל patch. הפעילו באפליקציה את **“Keep RTL after Claude updates”** (בשתי מערכות ההפעלה) ו‑RTL יוחל מחדש אוטומטית אחרי כל עדכון — הוא מחכה קודם שהעדכון יסתיים לגמרי, ולעולם לא סוגר בכוח Claude שרץ.

בשורת הפקודה: ‏`desktop/patch.sh --watch` / ‏`--unwatch` ‏(macOS, ‏LaunchAgent ברמת המשתמש), ‏`patch.ps1 -Watch` / ‏`-Unwatch` (התקנת claude.ai, ‏watcher בכניסה למערכת), ‏`patch-msix.ps1 -Watch` / ‏`-Unwatch` (התקנת החנות, משימה מתוזמנת).

</details>

<details>
<summary><b>🧹 הסרה / שחזור</b> — פקודה אחת, הפיך לגמרי</summary>

- **macOS:** לחצו **Uninstall** באפליקציה, או `desktop/patch.sh --uninstall` — מסיר את `‎~/Applications/Claude-RTL.app`; המקורי מעולם לא שונה.
- **Windows (התקנת claude.ai):** לחצו **Restore original** באפליקציה, או `patch.ps1 -Restore` — מחזיר את `claude.exe` ו‑`app.asar` מהגיבוי, בייט‑לבייט.
- **Windows (החנות):** ‏**Restore original**, או `patch-msix.ps1 -Restore` — מסיר גם את התעודה המקומית שנוצרה.
- **דפדפן:** הסירו את הסקריפט מ‑Tampermonkey.

</details>

<details>
<summary><b>🛠 פתרון תקלות</b></summary>

- **macOS לא פותח את האפליקציה** (“unidentified developer”): קליק‑ימני → **Open** → **Open**, או System Settings ‏← Privacy & Security ‏← **Open Anyway**. חד‑פעמי; בנייה מהמקור מדלגת על זה.
- **חלון ראשון לבן** אחרי ההתקנה (macOS): צאו (⌘Q) ופתחו שוב — אפקט חד‑פעמי.
- **בקשת keychain** ‏(macOS): לחצו **Always Allow** — העותק המתוקן קורא את אותה רשומת keychain מקומית ש‑Claude כבר משתמש בה.
- **“Open Claude-RTL” סוגר קודם את המקורי** — הם חולקים תיקיית נתונים ולא יכולים לרוץ יחד.
- **ה‑userscript לא עושה כלום** ‏(Chrome/Edge): הפעילו **“Allow User Scripts”** ל‑Tampermonkey ורעננו את claude.ai.
- **Windows מודיע שההתקנה בשימוש:** סגרו קודם את Claude, או תנו ל‑watcher להחיל RTL בפעם הבאה ש‑Claude ייסגר.

</details>

<details>
<summary><b>🧠 איך זה עובד</b> — 30 שניות של פנימיוּת</summary>

הדפדפן כבר מריץ אלגוריתם Bidi מלא של יוניקוד. Claude RTL לא מממש אותו מחדש — הוא מקבל את **החלטות הכיוון והבידוד** ונותן ל‑renderer לסדר. ‏CSS ‏`unicode-bidi: plaintext` לכל בלוק‑עלה הוא מנגנון כיוון‑הבסיס היחיד לטקסט רץ, כך שכל בלוק מחליט לעצמו והמכל לעולם לא מהופך בכוח. אפליקציות הדסקטופ מזריקות את אותו מנוע ל‑bundles של ה‑renderer של Claude, ומהפכות רק את כיוון מסגרת‑החלון ב‑main process.

העיצוב המלא: **[ARCHITECTURE.md](ARCHITECTURE.md)** · צינור ה‑Windows‏: **[WINDOWS.md](WINDOWS.md)**

</details>

<details>
<summary><b>⚠️ מגבלות (v1)</b></summary>

- **בלוקי קוד אמיתיים נשארים LTR** (במכוון — RTL משבש סוגריים, הזחה ואופרטורים). בלוק שהוא בעצם פרוזה עברית *כן* מזוהה ומרונדר RTL.
- **Artifacts בדסקטופ** מרונדרים ב‑iframe חוצה‑origin שה‑payload של הדסקטופ עוד לא נכנס אליו (ה‑userscript בדפדפן כן מכסה אותם).
- **אין עדיין גופן עברי מוטמע** — macOS ממילא מרנדר עברית עם גופני מערכת.
- הרשימה המלאה: **[ARCHITECTURE.md §15](ARCHITECTURE.md)**.

</details>

## 🤝 תרומה

PRs יתקבלו בשמחה — המנוע טהור ובדוק; הרף הוא `node --test` ירוק ושינוי קטן וממוקד. התחילו מ‑**[CONTRIBUTING.md](../CONTRIBUTING.md)**; אם Claude משנה את ה‑DOM שלו, ה‑**[runbook לאימוץ גרסת Claude חדשה](RUNBOOK-adopt-new-claude-version.md)** מראה בדיוק איך לעדכן את הסלקטורים.

## 🔏 חתימת קוד

ארטיפקטי ה‑release של Windows כפופים ל‑**[מדיניות חתימת הקוד](CODE_SIGNING.md)** של הפרויקט (תפקידי צוות, תהליך הבנייה, פרטיות). חתימת הקוד מוקמת בחינם דרך תוכנית ה‑OSS של [SignPath Foundation](https://signpath.org/).

## 📄 רישיון

[MIT](../LICENSE) © ליאור שעיה

</div>
