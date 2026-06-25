<p align="center">
  <img src="assets/claude-desktop-rtl-banner.svg" alt="Claude Desktop RTL" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> &nbsp;·&nbsp; <a href="README.he.md">עברית</a> &nbsp;·&nbsp; <b>العربية</b>
</p>

<p align="center">
  <i>دعم سلس للكتابة من اليمين إلى اليسار (العربية · العبرية · الفارسية) لـ<b>Claude Desktop</b> و<b>claude.ai</b> — من محرّك واحد نقي.</i>
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

يكتب Claude نصوصًا عربية وعبرية جميلة — لكنه يعرضها **من اليسار إلى اليمين**: النقاط في الجهة الخاطئة، وعلامات الترقيم تقفز إلى آخر السطر، والجداول تتدفّق بالعكس. يصلح **Claude RTL** ذلك في كل مكان يعمل فيه Claude، **دون أن يمسّ نصّك أو شبكتك إطلاقًا**.

## لماذا هو مختلف

- 🎯 **اتجاه لكل كتلة، بشكل صحيح.** كل فقرة وقائمة وجدول واقتباس تقرّر اتجاهها **بنفسها** حسب محتواها **هي**. تبقى الكتل الإنجليزية LTR وتنقلب الكتل العربية RTL — **في المستند نفسه**، دون انقلاب شامل (العلّة الموجودة في كل أداة أخرى).
- 🔒 **صفر شبكة. صفر تتبّع. صفر تخزين بيانات.** محادثاتك لا تغادر جهازك. النسخ وCtrl-F يبقيان **بايتًا ببايت** — لا نحقن أبدًا أي محارف يونيكود خفيّة.
- 🛡️ **آمن بحكم التصميم.** نسخة Claude الأصلية لديك **لا تُعدّل أبدًا**. نُصلح نسخة منفصلة، وهي **تنجو من تحديثات Claude تلقائيًا**.
- 🖥️ **سطح المكتب *والمتصفّح*، بمحرّك واحد.** تطبيق في شريط القوائم بنقرة واحدة لـClaude Desktop، وuserscript لـclaude.ai في أي متصفّح — يتشاركان المحرّك ذاته.
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

## 🚀 التثبيت

### macOS Desktop — الطريقة السهلة (موصى بها)

تطبيق في شريط القوائم يُثبّت ويُحدّث RTL بنقرة. التطبيق المبني **لا يحتاج Node ولا طرفية**.

```bash
git clone https://github.com/liorshaya/claude-desktop-rtl.git
cd claude-desktop-rtl/gui && ./build.sh          # بناء لمرة واحدة (يحتاج Node + Xcode CLT)
open "dist/Claude RTL.app"
```

ثم من التطبيق:
1. اضغط **Install RTL** — يُصلح نسخة في `~/Applications/Claude-RTL.app`.
2. سيطلب macOS كلمة مرور الـkeychain مرة واحدة → **Always Allow** *(جهازك، keychain خاصتك)*.
3. اضغط **Open Claude-RTL**. هذا كل شيء — RTL سلس.

فعّل **“Keep RTL after Claude updates”** ليُعيد تطبيق نفسه عند كل تحديث لـClaude.

> نسخة Claude الأصلية في `/Applications` لا تُمسّ. زر “Open Claude-RTL” يُغلق الأصلية أولًا (لا يمكنهما العمل معًا). نافذة أولى فارغة؟ أغلق (⌘Q) وأعد الفتح.

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

طلبات الدمج (PRs) مُرحّب بها — هذا مشروع مفتوح المصدر. ابدأ من **[CONTRIBUTING.md](CONTRIBUTING.md)**، وعندما يُغيّر Claude الـDOM خاصته، يوضّح **[دليل اعتماد إصدار Claude جديد](docs/RUNBOOK-adopt-new-claude-version.md)** بالضبط كيفية تحديث المُحدِّدات.

## 📄 الترخيص

[MIT](LICENSE) © Lior Shaya

</div>
