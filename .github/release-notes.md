<div dir="rtl">

## Blazma Cyber 1.1.7

منصة أمن سيبراني دفاعي لـ Windows 10/11، محلية أولًا، بالعربي والإنجليزي. الشرح الكامل: [README.ar.md](https://github.com/mr-kateba/Blazma-Cyber/blob/claude/vibrant-sagan-xxz92l/README.ar.md)

### الجديد في 1.1.7
- **كرة أرضية حقيقية في «معلومات IP»:** الموقع التقريبي للعنوان على كرة ثلاثية الأبعاد من صور NASA (Blue Marble وBlack Marble، مضمّنة — الكرة نفسها لا تحتاج إنترنت)، والليل والنهار حسب الوقت الحالي مع الوقت المحلي هناك. تعمل مع كرت شاشة أو بدونه.
- **الاستعلامات عبر الإنترنت مفعّلة افتراضيًا:** لم يعد البرنامج يبدأ في وضع عدم الاتصال لأن فحوصات كثيرة تحتاج إنترنت. لا يُرسَل شيء من تلقاء نفسه — كل استعلام يبدأ عندما تضغط زره فقط ويظهر في «نشاط الشبكة». الإعدادات القديمة تنتقل مرة واحدة، ووضع عدم الاتصال بضغطة من **مركز الخصوصية**.

سابقًا في 1.1.6: ألوان عائلة Blazma (جرافيت + برتقالي `#FF6D00`).

### التثبيت
1. نزّل `Blazma-Cyber-*-x64-setup.exe`.
2. المثبّت **غير موقّع بشهادة توقيع كود** بعد ← **Windows protected your PC** ← **More info** ثم **Run anyway**.
3. التثبيت للمستخدم الحالي، بلا صلاحيات مسؤول.

**بدون تثبيت:** `Blazma-Cyber-*-x64-portable.zip` — فكّ الضغط وشغّل `Blazma Cyber.exe`؛ البيانات في `Blazma-data` بجانبه.

### التحقق من الملف
- **مصدر البناء:** `gh attestation verify Blazma-Cyber-1.1.7-x64-setup.exe -R mr-kateba/Blazma-Cyber`
- **SHA-256:** قارن `Get-FileHash .\Blazma-Cyber-1.1.7-x64-setup.exe -Algorithm SHA256` بملف `SHA256SUMS.txt`.

### الحالة بصدق
- مُتحقَّق منه آليًا على Windows حقيقي: النظام، Defender، التوقيع الرقمي، التحليل الجنائي، الشبكة، pktmon، الواي فاي، الواجهة كاملة، وبناء المثبّت.
- **لم يُختبر بعد يدويًا:** الواي فاي على جهاز فيه كرت واي فاي، Nmap على Windows، التثبيت/الإزالة على سطح مكتب، فحص Defender السريع/الكامل، ومحركات John/hashcat الحقيقية.

</div>

---

## Blazma Cyber 1.1.7

Privacy-first, local-first, bilingual (Arabic/English) defensive cybersecurity workbench for Windows 10/11.

**New in 1.1.7**
- **A real globe in IP Intelligence:** the approximate location on a 3D Earth from NASA's Blue Marble and Black Marble imagery (bundled — the globe itself needs no Internet), day and night shaded for the current time, plus the local time there. Works with or without a graphics card.
- **Online lookups on by default:** the app no longer starts in Offline Mode, because many checks need the Internet. Nothing is sent by itself — each lookup starts only when you press its button and is listed in Network Activity. Older settings move once; Offline Mode is one switch away in the Privacy Center.

Earlier in 1.1.6: the Blazma family palette (graphite + orange `#FF6D00`).

- **Portable:** `Blazma-Cyber-*-x64-portable.zip` runs without installing; data stays in `Blazma-data` next to it.
- **Unsigned** (no certificate yet): SmartScreen → **More info → Run anyway**. Per-user install, no admin.
- **Verify provenance:** `gh attestation verify Blazma-Cyber-1.1.7-x64-setup.exe -R mr-kateba/Blazma-Cyber`.
- **Verify integrity:** compare `Get-FileHash <file> -Algorithm SHA256` with `SHA256SUMS.txt`.
- Verified automatically on real Windows in CI; not yet hand-tested: Wi-Fi hardware, Nmap on Windows, install/uninstall, Defender quick/full scans, real John/hashcat.
