<div dir="rtl">

## Blazma Cyber 1.1.8

منصة أمن سيبراني دفاعي لـ Windows 10/11، محلية أولًا، بالعربي والإنجليزي. الشرح الكامل: [README.ar.md](https://github.com/mr-kateba/Blazma-Cyber/blob/claude/vibrant-sagan-xxz92l/README.ar.md)

### الجديد في 1.1.8
- **سلسلة حفظ الأدلة للقضايا:** كل تغيير في القضية (إضافة دليل أو حذفه، تعديل ملاحظة، الأحداث، بيانات القضية، التقارير المصدَّرة مع بصمة ملفها) يُسجَّل مع من ومتى في سجل مترابط بالبصمات (SHA-256). البرنامج يتحقق منه ويُظهر بالضبط ما تغيّر خارج Blazma. احتفظ بـ «البصمة الأخيرة» (مطبوعة في كل تقرير قضية) لتثبت لاحقًا أن شيئًا لم يتغيّر.
- **فحص دوري مجدول:** «تكرار تلقائي» في صفحة الفحص الشامل — يوميًا أو أسبوعيًا — عبر «جدولة المهام» في Windows لحسابك فقط وبلا صلاحيات مسؤول. يفتح Blazma في الخلفية، يشغّل نفس الفحص للقراءة فقط، ويُظهر النتيجة في إشعار.

سابقًا في 1.1.7: الكرة الأرضية الحقيقية في «معلومات IP»، والاستعلامات عبر الإنترنت مفعّلة افتراضيًا.

### التثبيت
1. نزّل `Blazma-Cyber-*-x64-setup.exe`.
2. المثبّت **غير موقّع بشهادة توقيع كود** بعد ← **Windows protected your PC** ← **More info** ثم **Run anyway**.
3. التثبيت للمستخدم الحالي، بلا صلاحيات مسؤول.

**بدون تثبيت:** `Blazma-Cyber-*-x64-portable.zip` — فكّ الضغط وشغّل `Blazma Cyber.exe`؛ البيانات في `Blazma-data` بجانبه.

### التحقق من الملف
- **مصدر البناء:** `gh attestation verify Blazma-Cyber-1.1.8-x64-setup.exe -R mr-kateba/Blazma-Cyber`
- **SHA-256:** قارن `Get-FileHash .\Blazma-Cyber-1.1.8-x64-setup.exe -Algorithm SHA256` بملف `SHA256SUMS.txt`.

### الحالة بصدق
- مُتحقَّق منه آليًا على Windows حقيقي: النظام، Defender، التوقيع الرقمي، التحليل الجنائي، الشبكة، pktmon، الواي فاي، الواجهة كاملة، وبناء المثبّت.
- **لم يُختبر بعد يدويًا:** الواي فاي على جهاز فيه كرت واي فاي، Nmap على Windows، التثبيت/الإزالة على سطح مكتب، فحص Defender السريع/الكامل، ومحركات John/hashcat الحقيقية.

</div>

---

## Blazma Cyber 1.1.8

Privacy-first, local-first, bilingual (Arabic/English) defensive cybersecurity workbench for Windows 10/11.

**New in 1.1.8**
- **Chain of custody for cases:** every change to a case (evidence added or removed, notes edited, events, case details, exported reports with the file's SHA-256) is recorded with who and when in a SHA-256 hash chain. Blazma re-checks it and shows exactly what changed outside the app. Keep the head hash (printed in every case report) to prove later that nothing changed.
- **Scheduled checkup:** *Repeat automatically* on the Full checkup page — daily or weekly — through a Windows Task Scheduler task for your account only, no administrator rights. Blazma opens in the background, runs the same read-only checkup and shows the result as a notification.

Earlier in 1.1.7: the real globe in IP Intelligence; online lookups on by default.

- **Portable:** `Blazma-Cyber-*-x64-portable.zip` runs without installing; data stays in `Blazma-data` next to it.
- **Unsigned** (no certificate yet): SmartScreen → **More info → Run anyway**. Per-user install, no admin.
- **Verify provenance:** `gh attestation verify Blazma-Cyber-1.1.8-x64-setup.exe -R mr-kateba/Blazma-Cyber`.
- **Verify integrity:** compare `Get-FileHash <file> -Algorithm SHA256` with `SHA256SUMS.txt`.
- Verified automatically on real Windows in CI; not yet hand-tested: Wi-Fi hardware, Nmap on Windows, install/uninstall, Defender quick/full scans, real John/hashcat.
