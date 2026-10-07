<div dir="rtl">

## Blazma Cyber 1.1.6

منصة أمن سيبراني دفاعي لـ Windows 10/11، محلية أولًا، بالعربي والإنجليزي. الشرح الكامل: [README.ar.md](https://github.com/mr-kateba/Blazma-Cyber/blob/claude/vibrant-sagan-xxz92l/README.ar.md)

### الجديد في 1.1.6
- **هوية عائلة Blazma الحقيقية:** نفس ألوان Blazma Boost وGet وCrosshair وAI وNT — أسطح جرافيت، واللون البرتقالي `#FF6D00`، وأزرار أساسية برتقالية. (الإصدار 1.1.5 أخذ لونًا أزرق قديمًا بالخطأ.) شريط العنوان والرسوم والتقارير المطبوعة تتبعها أيضًا.

سابقًا في 1.1.4: إصلاح تشغيل استعادة كلمة المرور فعليًا (استخراج الهاش بأدوات John).

### التثبيت
1. نزّل `Blazma-Cyber-*-x64-setup.exe`.
2. المثبّت **غير موقّع بشهادة توقيع كود** بعد ← **Windows protected your PC** ← **More info** ثم **Run anyway**.
3. التثبيت للمستخدم الحالي، بلا صلاحيات مسؤول.

**بدون تثبيت:** `Blazma-Cyber-*-x64-portable.zip` — فكّ الضغط وشغّل `Blazma Cyber.exe`؛ البيانات في `Blazma-data` بجانبه.

### التحقق من الملف
- **مصدر البناء:** `gh attestation verify Blazma-Cyber-1.1.6-x64-setup.exe -R mr-kateba/Blazma-Cyber`
- **SHA-256:** قارن `Get-FileHash .\Blazma-Cyber-1.1.6-x64-setup.exe -Algorithm SHA256` بملف `SHA256SUMS.txt`.

### الحالة بصدق
- مُتحقَّق منه آليًا على Windows حقيقي: النظام، Defender، التوقيع الرقمي، التحليل الجنائي، الشبكة، pktmon، الواي فاي، الواجهة كاملة، وبناء المثبّت.
- **لم يُختبر بعد يدويًا:** الواي فاي على جهاز فيه كرت واي فاي، Nmap على Windows، التثبيت/الإزالة على سطح مكتب، فحص Defender السريع/الكامل، ومحركات John/hashcat الحقيقية.

</div>

---

## Blazma Cyber 1.1.6

Privacy-first, local-first, bilingual (Arabic/English) defensive cybersecurity workbench for Windows 10/11.

**New in 1.1.6**
- **The real Blazma family look:** the same palette as Blazma Boost, Get, Crosshair, AI and NT — graphite surfaces, the orange `#FF6D00` accent and solid orange primary buttons (1.1.5 had picked an outdated blue palette by mistake). Title bar, charts and printed reports follow it too.

Earlier in 1.1.4: password recovery actually runs (hash extracted with John's tools first).

- **Portable:** `Blazma-Cyber-*-x64-portable.zip` runs without installing; data stays in `Blazma-data` next to it.
- **Unsigned** (no certificate yet): SmartScreen → **More info → Run anyway**. Per-user install, no admin.
- **Verify provenance:** `gh attestation verify Blazma-Cyber-1.1.6-x64-setup.exe -R mr-kateba/Blazma-Cyber`.
- **Verify integrity:** compare `Get-FileHash <file> -Algorithm SHA256` with `SHA256SUMS.txt`.
- Verified automatically on real Windows in CI; not yet hand-tested: Wi-Fi hardware, Nmap on Windows, install/uninstall, Defender quick/full scans, real John/hashcat.
