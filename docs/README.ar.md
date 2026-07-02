<p align="center">
  <img src="../assets/claude-desktop-rtl-banner.svg" alt="Claude Desktop RTL" width="100%">
</p>

<p align="center">
  <a href="../README.md"><img src="../assets/language/btn-english.svg" alt="English" height="36"></a>
  &nbsp;
  <a href="README.he.md"><img src="../assets/language/btn-hebrew.svg" alt="עברית" height="36"></a>
  &nbsp;
  <img src="../assets/language/btn-arabic-active.svg" alt="العربية" height="36">
</p>

<p align="center">
  <i>دعم سلس للكتابة من اليمين إلى اليسار (العربية · العبرية · الفارسية) لـ<b>Claude Desktop</b> و<b>claude.ai</b> — من محرّك واحد نقي.</i>
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

**يجعل Claude RTL العربيةَ والعبرية والفارسية تُعرض بشكل صحيح — من اليمين إلى اليسار — في كل مكان يعمل فيه Claude، دون أن يمسّ نصّك أو شبكتك إطلاقًا.** فمن دونه يكتب Claude نصوصًا عربية جميلة ثم يعرضها من اليسار إلى اليمين: النقاط في الجهة الخاطئة، وعلامات الترقيم تقفز إلى آخر السطر، والجداول تتدفّق بالعكس.

<p align="center">
  <img src="../assets/language/claude-rtl-comparison.png" alt="نفس ردّ Claude بدون وبوجود Claude RTL — جداول وقوائم ونصوص عربية تُعرض من اليسار إلى اليمين (معطوبة) مقابل من اليمين إلى اليسار (صحيحة)" width="92%">
</p>

<p align="center">
  <sub><b>بدون</b> Claude RTL يُعرض الردّ من اليسار إلى اليمين — أعمدة جداول معكوسة وعلامات ترقيم في الجهة الخاطئة. <b>وبوجوده</b>، تُقرأ كل كتلة بشكل صحيح.</sub>
</p>

## لماذا هذا مهم

- 🎯 **اتجاه لكل كتلة، بشكل صحيح.** كل فقرة وقائمة وجدول واقتباس تقرّر اتجاهها **بنفسها** حسب محتواها **هي**. تبقى الكتل الإنجليزية LTR وتنقلب الكتل العربية RTL — **في المستند نفسه**، دون انقلاب شامل (العلّة الموجودة في كل أداة أخرى).
- 🔒 **صفر شبكة. صفر تتبّع. صفر تخزين بيانات.** محادثاتك لا تغادر جهازك. النسخ وCtrl-F يبقيان **بايتًا ببايت** — لا تُحقن أبدًا أي محارف يونيكود خفيّة.
- 🛡️ **آمن بحكم التصميم.** على macOS نسخة Claude الأصلية **لا تُعدّل أبدًا** (تُبنى نسخة مُرقّعة منفصلة)؛ وعلى Windows يُؤخذ **نسخ احتياطي للأصل أولًا** ونقرة واحدة تُعيده.
- 🖥️ **سطح المكتب *والمتصفّح*، بمحرّك واحد.** تطبيق في شريط القوائم على macOS، وتطبيق في شريط النظام (tray) على Windows، وuserscript لـclaude.ai في أي متصفّح — جميعها تتشارك محرّك الـbidi ذاته.
- 🧪 **نواة نقية ومُختبَرة.** ذكاء الـbidi‏ (`engine/`) خالٍ من الـDOM ومغطّى بمجموعة اختبارات قاسية، منفصل عن طريقة التوصيل.

## ✅ المنصّات المدعومة

| المنصّة | المتطلّبات |
|---|---|
| 🍎 **macOS Desktop** | macOS 13 (Ventura) أو أحدث. ملف الـ`.dmg` الجاهز لمعالجات Apple Silicon؛ أجهزة Intel تبني من المصدر. |
| 🪟 **Windows Desktop — مُثبّت claude.ai** | Windows 10 / 11 (‏64‑بت)، وClaude مُثبّت من claude.ai (ملف الـ`.exe` الكلاسيكي). |
| 🏪 **Windows Desktop — متجر Microsoft** | Windows 10 / 11 (‏64‑بت)، وClaude من متجر Microsoft‏ (MSIX). موافقة مسؤول لمرة واحدة. |
| 🌐 **المتصفّح — claude.ai** | أي نظام تشغيل. Chrome أو Edge أو Firefox أو Safari مع مدير userscript. |

## 🚀 التثبيت

<p align="center">
  <img src="../assets/language/claude-rtl-showcase.png" alt="مُدير Claude RTL — تطبيق شريط القوائم على macOS وتطبيق شريط النظام على Windows، وكلاهما يعرض “RTL is active”" width="80%">
</p>

<p align="center">
  <sub>المُدير بنقرة واحدة — على <b>macOS</b> (شريط القوائم) و<b>Windows</b> (شريط النظام). يُثبّت ويُحدّث تلقائيًا ويُزيل RTL، دون طرفية.</sub>
</p>

### 🍎 macOS

1. نزّل ملف الـ**`.dmg`** من [أحدث إصدار](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) واسحب **Claude RTL** إلى **Applications**.
2. *عند الفتح لأول مرة فقط:* انقر بالزر الأيمن على التطبيق → **Open** → **Open** *(على macOS Sequoia‏: System Settings ‏← Privacy & Security ‏← “Open Anyway”)*. لمرة واحدة، لأن التطبيق موقّع ad-hoc وليس موثّقًا من Apple.
3. اضغط **Install RTL**. سيطلب macOS كلمة مرور الـkeychain مرة واحدة → **Always Allow**.
4. اضغط **Open Claude-RTL**.

**سطر الأوامر** (مكافئ، أو لبناء التطبيق بنفسك — يحتاج Node و‏Xcode CLT):

<div dir="ltr">

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
desktop/patch.sh --install     # builds a patched copy at ~/Applications/Claude-RTL.app
desktop/patch.sh --status      # verify
# GUI app instead: cd gui && ./build.sh && open "dist/Claude RTL.app"
```

</div>

**✔ النتيجة المتوقّعة:** شارة التطبيق تعرض **“RTL is active”**، ويطبع `--status` السطر `patched : ~/Applications/Claude-RTL.app (v…) — installed`. نسخة Claude الأصلية في `/Applications` لا تُمسّ أبدًا.

### 🪟 Windows — مُثبّت من claude.ai

1. نزّل **`ClaudeRTL-Setup-…-win-x64.exe`** من [أحدث إصدار](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) وشغّله — تثبيت **لكل مستخدم**، دون صلاحيات مسؤول ودون أي متطلّبات مسبقة (بيئة تشغيل محمولة مُضمّنة في المُثبّت).
2. شغّل **Claude RTL** من قائمة ابدأ واضغط **Install RTL**. يُؤخذ نسخ احتياطي للأصل أولًا إلى `‎*.crtl-bak`.
3. افتح Claude.

**سطر الأوامر** (مكافئ — يحتاج Node عند التشغيل من نسخة git):

<div dir="ltr">

```powershell
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
powershell -ExecutionPolicy Bypass -File .\desktop\windows\preflight.ps1   # readiness check (read-only)
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1       # apply RTL in place
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch.ps1 -Status
```

</div>

**✔ النتيجة المتوقّعة:** شارة شريط النظام تعرض **“RTL is active”**، ويطبع `-Status` السطر `patched : True  (payload marker in app.asar)`.

### 🏪 Windows — متجر Microsoft (MSIX)

1. المُثبّت وتطبيق شريط النظام نفسهما كما في الأعلى — وهو **يكتشف تلقائيًا** تثبيت المتجر.
2. اضغط **Install RTL** ووافق على طلب **المسؤول** لمرة واحدة (UAC). يُعيد التطبيق توقيع Claude بشهادة محلية ليبقى **Cowork يعمل**؛ وزر **Restore original** يُرجع كل شيء كما كان.
3. افتح Claude.

**سطر الأوامر** (مكافئ — يُشغَّل من PowerShell **مرفوع الصلاحيات** (Run as administrator)، ويحتاج Node من نسخة git):

<div dir="ltr">

```powershell
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1          # apply (admin)
powershell -ExecutionPolicy Bypass -File .\desktop\windows\patch-msix.ps1 -Verify  # read-only check
```

</div>

**✔ النتيجة المتوقّعة:** يطبع `-Verify` السطر `RTL injected (asar marker)   : True` ويؤكّد أسطر الشهادة — ويبقى Cowork يعمل.

### 🌐 المتصفّح — claude.ai (أي نظام)

1. ثبّت **Tampermonkey** (أو Violentmonkey) وفعّل في الإضافة **“Allow User Scripts”** (متطلّب Chrome/Edge).
2. ابنِ الـuserscript (يحتاج Node):

<div dir="ltr">

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl
npm run build            # builds dist/claude-rtl.user.js
```

</div>

3. افتح `dist/claude-rtl.user.js` وثبّته (أو الصق محتواه في سكربت جديد في Tampermonkey).
4. أعد تحميل `claude.ai`.

**✔ النتيجة المتوقّعة:** الردود العربية والعبرية على claude.ai تُقرأ فورًا من اليمين إلى اليسار — بما في ذلك داخل لوحة الـArtifacts.

## 🧰 كل ما تبقّى

<details>
<summary><b>📋 ما الذي يعالجه</b> — قائمة الأسطح الكاملة</summary>

| السطح | السلوك |
|---|---|
| النصوص (فقرات، عناوين) | اتجاه أساس لكل كتلة عبر أول محرف قوي في المتصفّح |
| القوائم (بما فيها المتداخلة) | العلامات والإزاحة في جهة المحتوى؛ اتجاه ذكي لكل عنصر |
| الجداول | ترتيب الأعمدة يتبع أغلبية المحتوى؛ كل عمود يُحاذى إلى لغته |
| الاقتباسات | الشريط والإزاحة ينتقلان إلى جهة المحتوى |
| الأرقام، العملات، %، التواريخ | تُرتّب بشكل صحيح؛ لا تُجبر سطرًا عربيًا على LTR |
| المقارنات (`3 < 5`) والأعداد ذات الإشارة (`-5`) | تُعزل حتى لا تُقرأ الرياضيات بالعكس أبدًا |
| الأسهم (`→`) في RTL | تنعكس بصريًا — المحرف نفسه لا يتغيّر |
| كتل الشيفرة | تبقى **LTR** عمدًا (‏RTL يُشوّش البنية) |
| حقول الإدخال/التحرير | ‏`dir="auto"` فورًا، دون وميض |
| مستند مختلط إنجليزي/عربي | كل كتلة تقرّر بنفسها — دون انقلاب شامل |

</details>

<details>
<summary><b>🔁 إبقاء RTL بعد تحديثات Claude</b> — آلية إعادة التطبيق التلقائية</summary>

تحديثات Claude تستبدل ملفاته فتمحو أي ترقيع. فعّل **“Keep RTL after Claude updates”** في التطبيق (على النظامين) ليُعاد تطبيق RTL تلقائيًا بعد كل تحديث — تنتظر الآلية اكتمال التحديث تمامًا أولًا، ولا تُغلق أبدًا نسخة Claude تعمل.

من سطر الأوامر: ‏`desktop/patch.sh --watch` / ‏`--unwatch` ‏(macOS، عبر LaunchAgent على مستوى المستخدم)، ‏`patch.ps1 -Watch` / ‏`-Unwatch` (تثبيت claude.ai، مراقب عند تسجيل الدخول)، ‏`patch-msix.ps1 -Watch` / ‏`-Unwatch` (تثبيت المتجر، مهمّة مجدولة).

</details>

<details>
<summary><b>🧹 الإزالة والاستعادة</b> — أمر واحد، وقابل للعكس بالكامل</summary>

- **macOS:** اضغط **Uninstall** في التطبيق، أو `desktop/patch.sh --uninstall` — يُزيل `‎~/Applications/Claude-RTL.app`؛ الأصل لم يُعدَّل أساسًا.
- **Windows (تثبيت claude.ai):** اضغط **Restore original** في التطبيق، أو `patch.ps1 -Restore` — يُعيد `claude.exe` و`app.asar` من النسخة الاحتياطية بايتًا ببايت.
- **Windows (المتجر):** ‏**Restore original**، أو `patch-msix.ps1 -Restore` — يُزيل أيضًا الشهادة المحلية التي أُنشئت.
- **المتصفّح:** أزل السكربت من Tampermonkey.

</details>

<details>
<summary><b>🛠 استكشاف الأخطاء</b></summary>

- **macOS لا يفتح التطبيق** (“unidentified developer”): الزر الأيمن → **Open** → **Open**، أو System Settings ‏← Privacy & Security ‏← **Open Anyway**. لمرة واحدة؛ البناء من المصدر يتجاوزها.
- **نافذة أولى فارغة** بعد الترقيع (macOS): أغلق (⌘Q) وأعد الفتح — أثر لمرة واحدة.
- **طلب الـkeychain** ‏(macOS): اضغط **Always Allow** — النسخة المُرقّعة تقرأ نفس مُدخل الـkeychain المحلي الذي يستخدمه Claude أصلًا.
- **زر “Open Claude-RTL” يُغلق الأصلية أولًا** — فهما يتشاركان مجلد بيانات المستخدم ولا يمكنهما العمل معًا.
- **الـuserscript لا يفعل شيئًا** ‏(Chrome/Edge): فعّل **“Allow User Scripts”** لـTampermonkey ثم أعد تحميل claude.ai.
- **Windows يقول إن التثبيت قيد الاستخدام:** أغلق Claude أولًا، أو دع المراقب يُطبّق RTL عند إغلاق Claude في المرة القادمة.

</details>

<details>
<summary><b>🧠 كيف يعمل</b> — 30 ثانية من الداخل</summary>

المتصفّح يُشغّل أصلًا خوارزمية Bidi كاملة من يونيكود. لا يُعيد Claude RTL تنفيذها — بل يتّخذ **قرارات الاتجاه والعزل** ويترك المُحرّك يُعيد الترتيب. قاعدة CSS ‏`unicode-bidi: plaintext` لكل كتلة ورقية هي الآلية الوحيدة لاتجاه أساس النصوص، فتقرّر كل كتلة بنفسها ولا تنقلب الحاوية أبدًا بالقوة. تحقن تطبيقات سطح المكتب المحرّك نفسه في حِزَم عرض Claude، وتعكس فقط اتجاه إطار النافذة في العملية الرئيسية.

التصميم الكامل: **[ARCHITECTURE.md](ARCHITECTURE.md)** · خط أنابيب Windows‏: **[WINDOWS.md](WINDOWS.md)**

</details>

<details>
<summary><b>⚠️ القيود (v1)</b></summary>

- **كتل الشيفرة الحقيقية تبقى LTR** (عمدًا — RTL يُشوّش الأقواس والإزاحة والمعاملات). أمّا الكتلة التي هي في الحقيقة نثر عربي/عبري *فتُكتشف* وتُعرض RTL.
- **Artifacts على سطح المكتب** تُعرض داخل iframe عابر للأصل لا يصله payload سطح المكتب بعد (الـuserscript في المتصفّح يغطّيها).
- **لا خط عربي/عبري مُضمّن بعد** — macOS يعرض النصوص بخطوط النظام أصلًا.
- القائمة الكاملة: **[ARCHITECTURE.md §15](ARCHITECTURE.md)**.

</details>

## 🤝 المساهمة

طلبات الدمج (PRs) مُرحّب بها — المحرّك نقي ومُختبَر؛ والمعيار هو `node --test` أخضر وتغيير صغير محدّد الغرض. ابدأ من **[CONTRIBUTING.md](../CONTRIBUTING.md)**؛ وعندما يُغيّر Claude الـDOM خاصته، يوضّح **[دليل اعتماد إصدار Claude جديد](RUNBOOK-adopt-new-claude-version.md)** بالضبط كيفية تحديث المُحدِّدات.

## 📄 الترخيص

[MIT](../LICENSE) © Lior Shaya

</div>
