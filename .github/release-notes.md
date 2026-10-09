<div dir="rtl">

## Blazma Cyber 1.1.9

منصة أمن سيبراني دفاعي لـ Windows 10/11، محلية أولًا، بالعربي والإنجليزي. الشرح الكامل: [README.ar.md](https://github.com/mr-kateba/Blazma-Cyber/blob/claude/vibrant-sagan-xxz92l/README.ar.md)

### الجديد في 1.1.9
- **قوائم كلمات المرور** في «استعادة كلمات المرور»: أضف قوائمك مرة واحدة واخترها من قائمة، مع العدد الدقيق لكلمات المرور وحجم كل قائمة. قائمة John المرفقة (`password.lst`) تظهر تلقائيًا عند ضبط John. Blazma يتذكّر مكان الملفات فقط — لا ينسخها ولا يعدّلها ولا يحذفها.

سابقًا في 1.1.8: سلسلة حفظ الأدلة، الفحص الدوري المجدول، وسرعة الشبكة الآن.

### التثبيت
1. نزّل `Blazma-Cyber-*-x64-setup.exe`.
2. المثبّت **غير موقّع بشهادة توقيع كود** بعد ← **Windows protected your PC** ← **More info** ثم **Run anyway**.
3. التثبيت للمستخدم الحالي، بلا صلاحيات مسؤول.

**بدون تثبيت:** `Blazma-Cyber-*-x64-portable.zip` — فكّ الضغط وشغّل `Blazma Cyber.exe`؛ البيانات في `Blazma-data` بجانبه.

### التحقق من الملف
- **مصدر البناء:** `gh attestation verify Blazma-Cyber-1.1.9-x64-setup.exe -R mr-kateba/Blazma-Cyber`
- **SHA-256:** قارن `Get-FileHash .\Blazma-Cyber-1.1.9-x64-setup.exe -Algorithm SHA256` بملف `SHA256SUMS.txt`.

### الحالة بصدق
- مُتحقَّق منه آليًا على Windows حقيقي: النظام، Defender، التوقيع الرقمي، التحليل الجنائي، الشبكة، pktmon، الواي فاي، الواجهة كاملة، وبناء المثبّت.
- **لم يُختبر بعد يدويًا:** الواي فاي على جهاز فيه كرت واي فاي، Nmap على Windows، التثبيت/الإزالة على سطح مكتب، فحص Defender السريع/الكامل، ومحركات John/hashcat الحقيقية.

</div>

---

## Blazma Cyber 1.1.9

Privacy-first, local-first, bilingual (Arabic/English) defensive cybersecurity workbench for Windows 10/11.

**New in 1.1.9**
- **My wordlists** in Password Recovery: add your own lists once and pick them from a menu, with each list's exact number of passwords and size. John's own `password.lst` appears by itself when John is set up. Blazma only remembers where the files are — it never copies, changes or deletes them.

Earlier in 1.1.8: chain of custody for cases, scheduled checkup, live network speed.

- **Portable:** `Blazma-Cyber-*-x64-portable.zip` runs without installing; data stays in `Blazma-data` next to it.
- **Unsigned** (no certificate yet): SmartScreen → **More info → Run anyway**. Per-user install, no admin.
- **Verify provenance:** `gh attestation verify Blazma-Cyber-1.1.9-x64-setup.exe -R mr-kateba/Blazma-Cyber`.
- **Verify integrity:** compare `Get-FileHash <file> -Algorithm SHA256` with `SHA256SUMS.txt`.
- Verified automatically on real Windows in CI; not yet hand-tested: Wi-Fi hardware, Nmap on Windows, install/uninstall, Defender quick/full scans, real John/hashcat.
