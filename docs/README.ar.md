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
  <img alt="macOS" src="https://img.shields.io/badge/macOS-13%2B-000000?logo=apple&logoColor=white">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-10%20%2F%2011-0078D6?logo=windows&logoColor=white">
  <img alt="Browser" src="https://img.shields.io/badge/browser-any%20OS%20(userscript)-4c9a2a">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-3b82f6">
  <img alt="Network" src="https://img.shields.io/badge/network-zero-16a34a">
  <img alt="PRs" src="https://img.shields.io/badge/PRs-welcome-d4572a">
</p>

<div dir="rtl" align="right">

---

يكتب Claude نصوصًا عربية وعبرية جميلة — لكنه يعرضها **من اليسار إلى اليمين**: النقاط في الجهة الخاطئة، وعلامات الترقيم تقفز إلى آخر السطر، والجداول تتدفّق بالعكس. يصلح **Claude RTL** ذلك في كل مكان يعمل فيه Claude، **دون أن يمسّ نصّك أو شبكتك إطلاقًا**.

<p align="center">
  <img src="../assets/language/claude-rtl-comparison.png" alt="نفس ردّ Claude بدون وبوجود Claude RTL — جداول وقوائم ونصوص عربية تُعرض من اليسار إلى اليمين (معطوبة) مقابل من اليمين إلى اليسار (صحيحة)" width="92%">
</p>

<p align="center">
  <sub><b>بدون</b> RTL يُعرض الردّ نفسه من اليسار إلى اليمين — أعمدة جداول معكوسة وعلامات ترقيم في الجهة الخاطئة. <b>وبوجوده</b>، تُقرأ كل كتلة بشكل صحيح.</sub>
</p>

## لماذا هو مختلف

- 🎯 **اتجاه لكل كتلة، بشكل صحيح.** كل فقرة وقائمة وجدول واقتباس تقرّر اتجاهها **بنفسها** حسب محتواها **هي**. تبقى الكتل الإنجليزية LTR وتنقلب الكتل العربية RTL — **في المستند نفسه**، دون انقلاب شامل (العلّة الموجودة في كل أداة أخرى).
- 🔒 **صفر شبكة. صفر تتبّع. صفر تخزين بيانات.** محادثاتك لا تغادر جهازك. النسخ وCtrl-F يبقيان **بايتًا ببايت** — لا نحقن أبدًا أي محارف يونيكود خفيّة.
- 🛡️ **آمن بحكم التصميم.** نسخة Claude الأصلية لديك **لا تُعدّل أبدًا**. نُصلح نسخة منفصلة، وهي **تنجو من تحديثات Claude تلقائيًا**.
- 🖥️ **سطح المكتب *والمتصفّح*، بمحرّك واحد.** تطبيق في شريط القوائم على macOS وتطبيق في شريط النظام (tray) على Windows لـClaude Desktop، إضافةً إلى userscript لـclaude.ai في أي متصفّح — جميعها تتشارك المحرّك ذاته.
- 🧪 **نواة نقية ومُختبَرة.** ذكاء الـbidi (`engine/`) خالٍ من الـDOM ومغطّى بمجموعة اختبارات قاسية، منفصل عن طريقة التوصيل.

## ماذا يعالج

| السطح | السلوك |
|---|---|
| النصوص (فقرات، عناوين) | اتجاه لكل كتلة عبر أول محرف قوي في المتصفح |
| القوائم (بما فيها المتداخلة) | العلامات والإزاحة في جهة المحتوى؛ اتجاه ذكي لكل عنصر |
| الجداول | ترتيب الأعمدة يتبع العنوان؛ كل خلية تُحاذى للجدول |
| الاقتباسات | الشريط/الإزاحة ينتقلان إلى جهة المحتوى |
| الأرقام، العملات، %، التواريخ | تُرتّب بشكل صحيح؛ لا تُجبر سطرًا عربيًا على LTR |
| الأسهم (`→`) في RTL | تنعكس بصريًا — المحرف نفسه لا يتغيّر |
| كتل الشيفرة | تبقى **LTR** عمدًا (RTL يُشوّش البنية) |
| حقول الإدخال/التحرير | `dir="auto"` فورًا، دون وميض |
| مستند مختلط إنجليزي/عربي | كل كتلة تقرّر بنفسها — دون انقلاب شامل |

## ✅ المنصّات المدعومة

| السطح | المتطلّبات |
|---|---|
| 🍎 **macOS Desktop** | macOS 13 (Ventura) أو أحدث. ملف الـ`.dmg` الجاهز لمعالجات Apple Silicon؛ أجهزة Intel يمكنها البناء من المصدر. |
| 🪟 **Windows Desktop** | Windows 10 أو 11 (64‑بت). يُرقّع **كلا** تثبيتَي Claude — المُثبّت الكلاسيكي من claude.ai *و*نسخة Microsoft Store (MSIX). |
| 🌐 **المتصفّح — claude.ai** | أي نظام تشغيل. Chrome أو Edge أو Firefox أو Safari مع مدير userscript. |

## 🚀 التثبيت

<p align="center">
  <img src="../assets/language/claude-rtl-showcase.png" alt="مُدير Claude RTL — تطبيق شريط القوائم على macOS وتطبيق شريط النظام على Windows، وكلاهما يعرض ‏“RTL is active”" width="80%">
</p>

<p align="center">
  <sub>المُدير بنقرة واحدة — على <b>macOS</b> (شريط القوائم) و<b>Windows</b> (شريط النظام). يُثبّت ويُحدّث تلقائيًا ويُزيل RTL، دون طرفية.</sub>
</p>

### macOS Desktop — الطريقة السهلة (موصى بها)

تطبيق في شريط القوائم يُثبّت ويُحدّث ويُزيل RTL بنقرة. **لا يحتاج Node ولا طرفية**.

**الخيار أ — تنزيل التطبيق** (الأسرع)

1. نزّل **`Claude-RTL.dmg`** من [أحدث إصدار](https://github.com/liorshaya/claude-desktop-rtl/releases/latest).
2. افتحه واسحب **Claude RTL** إلى **Applications**.
3. *عند الفتح لأول مرة فقط:* انقر بزر الفأرة الأيمن على التطبيق → **Open** → **Open**. *(macOS Sequoia: System Settings → Privacy & Security → “Open Anyway”.)* هذه الخطوة لمرة واحدة لأن التطبيق مفتوح المصدر وموقّع ad-hoc وليس موثّقًا من Apple — الخيار ب يتجاوزها تمامًا.

**الخيار ب — البناء من المصدر** (دون تنبيه Gatekeeper)

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl/gui && ./build.sh          # بناء لمرة واحدة (يحتاج Node + Xcode CLT)
open "dist/Claude RTL.app"
```

ثم من التطبيق:
1. اضغط **Install RTL** — يُصلح نسخة في `~/Applications/Claude-RTL.app`.
2. سيطلب macOS كلمة مرور الـkeychain مرة واحدة → **Always Allow** *(جهازك، keychain خاصتك)*.
3. اضغط **Open Claude-RTL**. هذا كل شيء — RTL سلس.

فعّل **“Keep RTL after Claude updates”** ليُعيد تطبيق نفسه عند كل تحديث لـClaude. زر **Check for updates** (ضمن *Details*) يجلب إصدارات أحدث من التطبيق نفسه.

> نسخة Claude الأصلية في `/Applications` لا تُمسّ. زر “Open Claude-RTL” يُغلق الأصلية أولًا (لا يمكنهما العمل معًا). نافذة أولى فارغة؟ أغلق (⌘Q) وأعد الفتح.

### Windows Desktop

تطبيق في شريط النظام (tray) يُثبّت ويُحدّث ويُزيل RTL — **دون Node، ودون طرفية، ودون تثبيت أي شيء مسبقًا** (بيئة تشغيل محمولة مُضمّنة في المُثبّت).

1. نزّل **`ClaudeRTL-Setup.exe`** من [أحدث إصدار](https://github.com/liorshaya/claude-desktop-rtl/releases/latest) وشغّله. إنه تثبيت **لكل مستخدم** — لا يحتاج صلاحيات مسؤول.
2. شغّل **Claude RTL** من قائمة ابدأ واضغط الزر لترقيع Claude. يكتشف التطبيق كيفية تثبيت Claude ويُطبّق RTL في مكانه، مع نسخ احتياطي للأصل أولًا.
3. افتح Claude — تُعرض العربية والعبرية والفارسية بـRTL.

فعّل **“Keep RTL after Claude updates”** ليُعيد تطبيق نفسه تلقائيًا بعد كل تحديث لـClaude.

> يعمل مع **كلا** التثبيتَين: ملف الـ`.exe` الكلاسيكي من claude.ai *و*نسخة Microsoft Store (MSIX). في نسخة الـStore، يطلب تطبيق RTL **موافقة مسؤول** لمرة واحدة (UAC) — إذ يُعيد توقيع Claude بشهادة محلية ليبقى Cowork يعمل، و**“Restore original” يُرجع كل شيء كما كان**. الأصل دائمًا مُحتفَظ به كنسخة احتياطية.

تفضّل سطر الأوامر؟ خط أنابيب PowerShell موثّق في **[desktop/windows/README.md](../desktop/windows/README.md)**.

### المتصفّح — claude.ai (أي نظام)

يعمل في Chrome وEdge وFirefox وSafari — أينما وُجد مدير userscript.

```bash
npm run build            # يبني dist/claude-rtl.user.js
```

1. ثبّت **Tampermonkey** (أو Violentmonkey).
2. افتح `dist/claude-rtl.user.js` وثبّته (أو الصق محتواه في سكربت جديد).
3. في الإضافة، فعّل **“Allow User Scripts”** (متطلّب Chrome/Edge).
4. أعد تحميل `claude.ai`.

### CLI — متقدّم (macOS)

```bash
desktop/patch.sh --install      # الترقيع (بناء نسخة + حقن RTL)
desktop/patch.sh --watch        # إعادة التطبيق تلقائيًا عند تحديثات Claude
desktop/patch.sh --status       # حالة الأصلية / المُرقّعة / المراقب
desktop/patch.sh --uninstall    # إزالة النسخة (الأصلية لا تُمسّ)
```

## 🧠 كيف يعمل

المتصفّح يُشغّل أصلًا خوارزمية Bidi كاملة من يونيكود. نحن لا نُعيد تنفيذها — بل نتّخذ **قرارات الاتجاه والعزل** ونترك المُحرّك يُعيد الترتيب. قاعدة CSS `unicode-bidi: plaintext` لكل كتلة ورقية هي الآلية الوحيدة لاتجاه النصوص، فتقرّر كل كتلة بنفسها ولا تنقلب الحاوية أبدًا. يحقن تطبيق سطح المكتب المحرّك نفسه في حِزَم عرض Claude، ويعكس فقط اتجاه إطار النافذة في العملية الرئيسية.

التصميم الكامل: **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## ⚠️ القيود (v1)

- **كتل الشيفرة الحقيقية تبقى LTR** (عمدًا — RTL يُشوّش الأقواس والإزاحة والمعاملات).
- **Artifacts على سطح المكتب** تُعرض داخل iframe عابر للأصل لا يصله payload سطح المكتب بعد (الـuserscript في المتصفّح يغطّيها).
- **لا خط عبري/عربي مُضمّن بعد** — macOS يعرض النصوص بخطوط النظام أصلًا.
- القائمة الكاملة في **[ARCHITECTURE.md §15](ARCHITECTURE.md)**.

## 🤝 المساهمة

طلبات الدمج (PRs) مُرحّب بها — هذا مشروع مفتوح المصدر. ابدأ من **[CONTRIBUTING.md](../CONTRIBUTING.md)**، وعندما يُغيّر Claude الـDOM خاصته، يوضّح **[دليل اعتماد إصدار Claude جديد](RUNBOOK-adopt-new-claude-version.md)** بالضبط كيفية تحديث المُحدِّدات.

## 📄 الترخيص

[MIT](../LICENSE) © Lior Shaya

</div>
