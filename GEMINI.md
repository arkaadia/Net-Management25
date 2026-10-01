# AI Coding Agent Directives & Mandatory Rules (قوانین و دستورالعمل‌های اجباری هوش مصنوعی)

> [!CRITICAL]
> **قانون قطعی و اجباری تغییر و ارتقای نسخه در هر تغییر (MANDATORY VERSION BUMPING RULE)**
> **هر هوش مصنوعی یا توسعه‌دهنده‌ای که در این پروژه تغییری ایجاد می‌کند، موظف است نسخه برنامه (Version) را بر اساس اندازه و نوع تغییر ارتقا دهد.**
> 
> Any AI agent or developer making ANY change in this codebase MUST increment the application version based on the size and type of the change before committing and completing the task.

---

## 1. قوانین تعیین شماره نسخه (Semantic Versioning Rules)

شماره نسخه پروژه از استاندارد `MAJOR.MINOR.PATCH` پیروی می‌کند:

1. **PATCH (`x.y.Z + 1`) - تغییرات کوچک و رفع باگ (Bugfixes & Minor Tweaks)**:
   - رفع باگ‌ها و مشکلات عملکردی جزئی (Bug fixes)
   - بهبودهای استایل، رنگ‌بندی، تایپوگرافی یا فاصله‌ها (CSS/UI styling adjustments)
   - رفع خطاهای تایپی و ترجمه (Typo & localization fixes)
   - *مثال*: ارتقا از `1.16.0` به `1.16.1`

2. **MINOR (`x.Y + 1.0`) - قابلیت‌ها و فیچرهای جدید (New Features & Modules)**:
   - افزودن فیچر، کامپوننت، ویو یا مدال جدید (New feature / component / modal)
   - افزودن پروتکل یا درایورهای جدید (مانند پروتکل‌های جدید VPN، ماژول‌های تجهیزات)
   - توسعه و ارتقای چشمگیر در منطق کاری یا ابزارهای نرم‌افزار
   - ریست شدن بخش PATCH به صفر (مانند `1.16.x` به `1.17.0`)
   - *مثال*: ارتقا از `1.16.4` به `1.17.0`

3. **MAJOR (`X + 1.0.0`) - تغییرات ساختاری بنیادین و بازنویسی اساسی (Breaking Changes)**:
   - بازنویسی کامل معماری نرم‌افزار یا بخش اعظمی از سیستم
   - تغییرات ساختاری که با نسخه‌های پیشین ناسازگار است
   - ریست شدن بخش‌های MINOR و PATCH به صفر
   - *مثال*: ارتقا از `1.x.x` به `2.0.0`

---

## 2. فایل‌هایی که در هر ارتقای نسخه باید همگام‌سازی شوند (Mandatory Files to Update)

هنگام اعمال هر تغییر، دو فایل زیر **حتماً و بدون استثنا** باید همگام شوند:

### الف) فایل `/package.json`:
فیلد `"version"` باید به شماره نسخه جدید به‌روزرسانی شود:
```json
{
  "name": "nettopology",
  "version": "1.16.0",
  ...
}
```

### ب) فایل `/src/version.ts`:
1. مقدار ثابت `APP_VERSION` تغییر یابد:
   ```typescript
   export const APP_VERSION = '1.16.0';
   ```
2. یک آبجکت جدید از نوع `ReleaseNote` در ابتدای آرایه `RELEASE_HISTORY` ثبت شود شامل:
   - `version`: شماره نسخه جدید (مطابق با `package.json`)
   - `releaseDate`: تاریخ انتشار به فرمت `YYYY-MM-DD`
   - `type`: یکی از مقادیر `'major' | 'minor' | 'patch'`
   - `title`: عنوان تغییر به زبان فارسی
   - `title_en`: عنوان تغییر به زبان انگلیسی
   - `changes`: لیست تغییرات و جزئیات اعمال شده به زبان فارسی
   - `changes_en`: لیست تغییرات و جزئیات اعمال شده به زبان انگلیسی

---

## 3. چک‌لیست اعتبارسنجی قبل از کامیت (Pre-Commit Validation)
قبل از ارسال کامیت و پوش:
1. اجرای `tsc --noEmit` یا `npm run lint` جهت اطمینان از صحت انواع و عدم خطای تایپ اسکریپت
2. ساخت پروژه بدون خطا (`npm run build`)
3. درج شماره نسخه یا تگ متعارف در پیام کامیت، برای مثال:
   `feat(vpn): add full mikrotik vpn suite (v1.16.0)`
   یا
   `fix(sidebar): resolve child accordion collapse (v1.16.1)`

---

## 4. قانون قطعی رعایت کامل زبان انتخابی و چندزبانگی (Mandatory Strict i18n & Localization Rule)

> [!CRITICAL]
> **قانون ممنوعیت نمایش متن فارسی در حالت انگلیسی (NO PERSIAN TEXT IN ENGLISH MODE)**
> وقتی زبان پنل روی انگلیسی (`en`) تنظیم است، **هیچ متنی** (پیام‌ها، عناوین، اعلان‌ها، کارت‌ها، لاگ‌ها، متن‌های آپدیت، وضعیت‌ها و دکمه‌ها) نباید به زبان فارسی نمایش داده شود مگر اینکه زبان پنل صراحتاً فارسی (`fa`) باشد.
> تمامی پیام‌ها، خطاها، توضیحات ریلیز، پیام‌های مدال، نوتیفیکیشن‌ها و پاپ‌آپ‌ها باید صددرصد وابسته به زبان فعال پنل (`language` / `isEn`) باشند:
> - اگر زبان انگلیسی است (`isEn === true`): تمامی متون، تایتل‌ها، توضیحات و لاگ‌ها باید به انگلیسی نمایش داده شوند و برای داده‌های نسخه از فیلدهای `title_en` و `changes_en` استفاده شود.
> - اگر زبان فارسی است: از متون فارسی (`title` و `changes`) استفاده شود.
> - نوشتن پیام‌های هاردکدشده یا فالبک‌های صرفاً فارسی بدون شرط زبان اکیداً ممنوع است.

---

## 5. قانون قطعی پشتیبانی از قابلیت مینیمایز در تمامی مودال‌ها (Mandatory Universal Modal Minimization Rule)

> [!CRITICAL]
> **قانون تجهیز هر مودال به دکمه و امکان مینیمایز (UNIVERSAL MODAL MINIMIZE RULE)**
> هر مودالی که در این برنامه باز می‌شود یا در آینده ایجاد می‌گردد، **باید حتماً امکان مینیمایز شدن (Minimize) داشته باشد**:
> 1. دکمه مینیمایز (`Minus` از کتابخانه `lucide-react`) باید در هدر کنار دکمه بستن (`X`) قرار گیرد.
> 2. با زدن دکمه مینیمایز، مودال بسته شده اما استیت آن حفظ می‌گردد و تب آن در نوار داک پایین صفحه (`ToolsDock`) در کنار سایر تب‌ها می‌نشیند (بدون افتادن روی یکدیگر).
> 3. در صورت افزایش تعداد تب‌ها یا پر شدن عرض صفحه، تب‌ها به طور خودکار قابل دسته‌بندی (`tools`, `device`, `terminal`, `system`, `config`) و فیلتر کردن هستند.
> 4. توسعه‌دهندگان باید دستورالعمل مندرج در `MODAL_GUIDELINES.md` را در طراحی هر مودال جدید رعایت کنند.

---

## 6. قانون قطعی ارسال و پوش مستقیم به برنچ مستر (Mandatory Push to Master Branch Rule)

> [!CRITICAL]
> **قانون ارسال همیشگی تغییرات به برنچ master (ALWAYS PUSH TO MASTER BRANCH)**
> تمام کامیت‌ها و پوش‌های گیت در این پروژه باید **همیشه و منحصراً بر روی برنچ `master`** انجام و ارسال شوند (`git push origin master`).
> برنچ پیش‌فرض و اصلی ریپازیتوری `master` است و هرگونه پوش یا فعال‌سازی شاخه‌های متفرقه بدون هدایت به `master` اکیداً ممنوع است.

---

## 7. قانون قطعی و جامع استاندارد ساخت تمامی مودال‌ها (Mandatory Universal Modal Architectural Standards)

> [!CRITICAL]
> **قانون الزامی و تخطی‌ناپذیر ساخت و پیاده‌سازی مودال‌ها (UNIVERSAL MODAL SPECIFICATION RULE)**
> هر مودالی که در این برنامه ساخته شده یا در آینده ایجاد می‌گردد، **باید حتماً و بدون استثنا تمامی ۵ شرط زیر را دارا باشد**:
> 
> 1. **دکمه‌های سه‌گانه کنترلی هدر (بستن، مینیمایز، تمام‌صفحه)**:
>    - در هدر هر مودال (در بخش دکمه‌های کنترل بالا) باید هر ۳ دکمه تعبیه شوند:
>      - دکمه بستن (`Close` - آیکون `X`)
>      - دکمه مینیمایز (`Minimize` - آیکون `Minus`) برای ارسال و نگهداری تب در نوار ابزار پایین (`ToolsDock`)
>      - دکمه تمام‌صفحه و خروج از آن (`Fullscreen / Exit Fullscreen` - آیکون‌های `Maximize2` و `Minimize2` با استیت `isMaximized`)
> 
> 2. **رفتار دقیق لبه، حفظ حریم همیشگی فوتر و اولویت مطلق منو و تمامی مودال‌های ابزارها (Strict Universal Footer Clearance & Tools Modals Super-Priority)**:
>    - **حفظ مرز فوتر در تمامی حالات (بزرگ‌نمایی و عادی)**: کادر بیرونی، پوشش پس‌زمینه (overlay) و کانتینر مودال چه در حالت عادی و چه در حالت تمام‌صفحه (`isMaximized`) باید **دقیقاً تا لبه بالایی فوتر (فاصله `bottom-8` از پایین صفحه)** مهار شود (`fixed top-0 left-0 right-0 bottom-8 z-[9999]`).
>    - مودال و بک‌دراپ آن به هیچ عنوان نباید روی فوتر، اطلاعات تلمتری شبکه، دکمه‌های وضعیت یا نوار داک پایین (`ToolsDock`) بیفتد یا آن را تیره و غیرقابل کلیک نماید؛ فوتر همیشه باید آزاد، روشن و کلیک‌پذیر باشد.
>    - **اولویت مطلق منوی ابزارها (Tools Menu Above All Modals)**: هنگامی که منوی ابزارها (`NetworkToolsMenu`) از دکمه `tools` در فوتر باز می‌شود، باید **بالاتر از تمامی مودال‌ها و پنجره‌ها (حتی ترمینال و فایل اکسپلورر در حالت تمام‌صفحه)** باز شود. این منو باید مستقیماً با `createPortal` در `document.body` و با لایه فوقانی `z-[999999]` رندر شود تا هیچ پنجره یا مودالی نتواند روی آن قرار گیرد.
>    - **قانون قطعی برتری لایه‌ای تمامی مودال‌های ابزارها بر کل پنجره‌ها (Tools Modals Above All Windows)**:
>      - تمامی مودال‌های ابزارهای شبکه (شامل `IpSubnetModal`, `PasswordGeneratorModal`, `PortScannerModal`, `DnsUtilitiesModal`, `TracerouteModal`, `CertLookupModal`, `HeaderAnalyzerModal`, `UpsCalculatorModal`, `HostCheckerModal`, `PasswordVaultModal` و هر مودال ابزار جدیدی که در آینده توسعه یابد) **باید همواره و بدون استثنا بالاتر از تمامی مودال‌ها و پنجره‌ها (شامل کاوشگر فایل `LinuxFileExplorerModal`، ترمینال لینوکس `LinuxTerminalModal`، ترمینال چندگانه `MultiTerminalWorkspace`، ترمینال میکروتیک، ریموت دسکتاپ و پنجره‌های تنظیمات سرور و تجهیزات)** باز شوند و به هیچ وجه نباید زیر آنها قرار گیرند.
>      - **معماری رندرینگ پورتال و سلسله‌مراتب z-index الزامی برای ابزارها**:
>        ۱. هر مودال ابزار باید مستقیماً با `createPortal(..., document.body)` در ریشه سند رندر شود تا در هیچ Stacking Context یا والد با overflow محدودکننده محبوس نگردد.
>        ۲. لایه z-index پایه تمام مودال‌های ابزارها باید روی **`z-[999990]`** تنظیم شود تا بالاتر از پنجره‌های سرور و ترمینال (`z-[9999]` و کادرهای داخلی `z-[99999]`) قرار گیرد.
>        ۳. پنجره‌ها و دیالوگ‌های داخلی درون ابزارها (مانند پیش‌نمایش کد در مبدل سرتیفیکیت یا تایید رمز در ولت) روی **`z-[999995]`** تنظیم شوند.
>        ۴. نوار داک ابزارها (`ToolsDock`) روی **`z-[999995]`** و پاپ‌اور منوی آن روی **`z-[1000000]`** قرار دارد.
>        ۵. منوی ابزارها (`NetworkToolsMenu`) که از دکمه فوتر باز می‌شود با لایه **`z-[999999]`** بر فراز تمام پنجره‌ها باز می‌گردد.
>        ۶. کادرهای راهنمای Info (`FieldInfoTooltip`) همواره روی لایه **`z-[1000005]`** قرار می‌گیرند تا روی همه المان‌ها شناور باشند.
>      - تعریف هرگونه مودال سرور، ترمینال، دستگاه یا صفحه عادی با لایه z-index بزرگتر از `99999` که باعث پوشاندن مودال‌های ابزارها شود، اکیداً ممنوع و نقض صریح معماری سیستم محسوب می‌شود.
> 
> 3. **انطباق کامل با تم تیره و تم روشن (Theme Adaptability & Strict Contrast)**:
>    - ظاهر مودال و اجزای داخلی آن باید با تم فعال پنل (تیره یا روشن) ۱۰۰٪ همخوانی داشته باشند (`isLightMode`).
>    - **در تم تیره**: استفاده از پس‌زمینه‌های تیره و مات (`bg-slate-950` یا `bg-slate-900`)، کادرهای مرزی ملایم (`border-slate-800` یا `border-cyan-500/30`)، و متون سفید/روشن باکنتراست بالا (`text-slate-100` / `text-white`).
>    - **در تم روشن**: استفاده از پس‌زمینه‌های روشن، بدون کدورت یا تیرگی زننده (`bg-slate-50` یا `bg-white`)، کادرهای تفکیک‌شده (`border-slate-200`)، و متون خوانا با بالاترین کنتراست ارگونومیک (`text-slate-800` / `text-slate-900`).
> 
> 4. **همگام‌سازی صددرصدی با زبان فعال پنل (Strict Bilingual i18n)**:
>    - زبان تمامی متون، عناوین، برچسب‌ها، دکمه‌ها، اعلان‌ها و توضیحات داخل مودال باید دقیقاً بر اساس زبان انتخابی پنل (`language` / `isEn`) تنظیم شود.
>    - در حالت انگلیسی (`isEn === true`)، نمایش هرگونه متن یا کاراکتر فارسی اکیداً ممنوع است.
>    - در حالت فارسی (`isEn === false`)، تمام متون باید کاملاً به فارسی روان و خوانا باشد.
> 
> 5. **تجهیز آیتم‌ها به کادر راهنمای Info با ساختار سه‌گانه و جلوگیری قطعی از خروج از صفحه (Boundary-Safe 3-Part Field Info Tooltip)**:
>    - کنار آیتم‌ها، گزینه‌ها و فیلدهای تنظیماتی باید دکمه/آیکون Info وجود داشته باشد که شامل ۳ بخش مجزا و شفاف باشد:
>      - **این چیست؟ (What is it?)**: تعریف مختصر و شفاف مفهوم یا فیلد.
>      - **چرا لازم است؟ (Why is it needed?)**: علت الزام یا کاربرد مهندسی آن در شبکه.
>      - **مثال کاربردی (Practical Example / Recommended Value)**: نمونه مقدار استاندارد یا سناریوی واقعی.
>    - **جلوگیری از خروج از کادر (4-Way Boundary Clamping)**: تمامی پاپ‌آپ‌های بازشونده Info باید با `createPortal` در `document.body` رندر شده و دارای الگوریتم سنجش موقعیت و چرخش خودکار (Auto-Flip) باشند تا از هیچ‌یک از ۴ جهت صفحه (بالا، پایین، چپ و راست) از کادر مانیتور یا پنجره خارج یا بریده نشوند (حفظ حداقل ۱۲ پیکسل فاصله ایمن از هر لبه).

---

## 8. Absolute Prohibition of Fake or Simulated Data (No Fake/Simulated Data — Ever)

> [!CRITICAL]
> **ABSOLUTE PROHIBITION ON MOCK, FAKE, OR SIMULATED DATA**
> Every component or module in this panel that communicates with or represents a real device (switches, routers, firewalls, Linux servers, Windows servers) — whether over SSH, Telnet, WinBox, RDP, VNC, SNMP, REST API, or any other protocol — **MUST ALWAYS AND ONLY** display authentic, live data received directly from the physical or virtual target device.
> 
> 1. **Zero Fake Generation**: Generating, mocking, synthesizing, simulating, hardcoding, or rendering any form of "plausible-looking fake data" in place of genuine device output is **STRICTLY AND UNCONDITIONALLY FORBIDDEN**. This applies under all circumstances, even as a temporary fallback to prevent a blank or unpopulated screen.
> 2. **Failure Transparency**: If real device data is unreachable or delayed (e.g., due to network timeout, authentication rejection, connection drop, protocol negotiation failure, or device offline status), the application must display an authentic loading state or an explicit, accurate error message (e.g., `"No response from device"`, `"Connection timed out"`, `"SSH authentication failed"`). Never mask or substitute connection failures with fake telemetry, mock logs, or simulated responses.

---

## 9. Claim "Resolved" Only After Real Testing with Concrete Proof (Evidence-Based Resolution)

> [!CRITICAL]
> **EMPIRICAL PROOF REQUIRED FOR ANY RESOLUTION CLAIM**
> No defect, bug, regression, or requested capability shall EVER be declared or announced as "Resolved", "Fixed", or "Completed" unless verified through actual testing in the real execution environment, accompanied by tangible empirical proof.
> 
> 1. **Tangible Evidence**: Proof must consist of actual runtime execution logs, real command output, terminal captures, or verifiable runtime behavior — not theoretical speculation.
> 2. **No Theoretical Assumptions**: Theoretical reasoning explaining "why this fix should work" does NOT qualify as verification.
> 3. **Honesty Regarding Environment Constraints**: If real-world testing cannot be performed from inside the execution environment (e.g., due to isolated container boundaries, network sandboxing, or absent physical hardware), the AI agent MUST explicitly and honestly declare that it could not be tested against real hardware and request the user to test and verify — rather than claiming or assuming it works.

---

## 10. Strict Zero-Regression Mandate (No Regression on Existing Working Capabilities)

> [!CRITICAL]
> **PRESERVE ALL EXISTING WORKING FUNCTIONALITY**
> Any new fix, refactoring, or feature addition must not break, degrade, or regress any feature, workflow, or code path that was previously working.
> 
> 1. **Shared Logic Impact Assessment**: When a fix requires altering shared code or infrastructure used across multiple areas (e.g., SSH connection logic, WebSocket tunnels, authentication managers, state stores, or modal docking mechanics), the developer or AI agent must thoroughly evaluate, verify, and report the impact across all dependent modules before applying the change.
> 2. **Preserve Surrounding Workflows**: Fixing one specific edge case must never compromise adjacent or broader system capabilities.

---

## 11. Atomic Commits, Granular Pushes & Mandatory Versioning per Independent Item

> [!CRITICAL]
> **SEPARATE COMMIT AND PUSH PER INDEPENDENT ITEM**
> When a user request comprises multiple independent bugs, features, or tasks, each distinct item **MUST** be committed and pushed separately to the `master` branch (`git commit` followed by `git push origin master`). Monolithic "batch" commits combining multiple unrelated changes are prohibited.
> 
> 1. **Independent History**: Each commit must focus strictly on its designated single concern, ensuring clear git bisecting and auditability.
> 2. **Mandatory Version Synchronization**: After each independent commit, the project version MUST be incremented following semantic versioning guidelines (`MAJOR.MINOR.PATCH`) and synchronized across both `/package.json` and `/src/version.ts` with descriptive bilingual release notes.

---

## 12. Adaptive Multi-Generation Device & Protocol Management (Modern First, Graceful Legacy Fallback)

> [!CRITICAL]
> **ADAPTIVE PROTOCOL NEGOTIATION (MODERN BY DEFAULT, AUTOMATIC LEGACY FALLBACK)**
> All connection and management protocols (SSH, RDP, VNC, WinBox, Telnet, etc.) must be implemented adaptively rather than hardcoded to a single generation:
> 
> 1. **Modern Protocol Priority**: Always initiate connection attempts using modern, secure, standard algorithms and ciphers (e.g., modern TLS, Ed25519/RSA-SHA2, AES-GCM, standard RDP security).
> 2. **Graceful Automatic Fallback**: If, and ONLY IF, the modern connection genuinely fails due to protocol/cipher incompatibility, automatically and seamlessly retry with legacy-compatible algorithms (e.g., `ssh-rsa`, `diffie-hellman-group1-sha1`, legacy key exchanges, or compatible RDP security layers) — without forcing the user to manually classify whether the target device is old or new.
> 3. **Non-Restrictive User Choices**: Any manual user configuration (such as selecting an OS type or protocol preference in a device registration form) must be treated as a "first priority" preference, not as an exclusive hard lock that prevents attempting compatible alternatives.

---

## 13. Root-Cause Engineering vs. Superficial Symptom Patching

> [!CRITICAL]
> **INVESTIGATE AND FIX THE ROOT CAUSE, NOT JUST THE SYMPTOM**
> When a bug or failure is reported, the underlying root cause must be diagnosed, identified, and addressed at its source.
> 
> 1. **No Superficial Patches**: Altering an error string, suppressing warnings, swallowing exceptions with silent `try/catch` blocks, or adding arbitrary fallbacks without understanding why the failure occurred is strictly unacceptable.
> 2. **Clear Technical Explanation**: The actual root cause must be explained clearly and technically before or alongside the solution.

---

## 14. Zero-Leak Credential Security & In-Flight Cryptography

> [!CRITICAL]
> **CREDENTIAL CONFIDENTIALITY & SERVER-SIDE ONLY DECRYPTION**
> Device passwords, private keys, API tokens, and sensitive authentication secrets must **NEVER** be stored in plain text anywhere in the database, local files, or browser storage.
> 
> 1. **Encrypted at Rest**: All credentials must be stored encrypted using robust, industry-standard cryptography (e.g., AES-256-GCM with secure key derivation).
> 2. **Server-Side Decryption Only**: Decryption of device credentials must occur exclusively on the backend server at the exact instant of establishing the connection, and immediately scrubbed from working memory once the session is established.
> 3. **Zero Frontend/Client Leakage**: Plain-text credentials and passwords must **NEVER** be transmitted to the frontend/browser client or exposed in API response payloads, audit log parameters, or error traces.

---

## 15. Mandatory PostgreSQL-Authoritative RBAC & Access Control (No Security in LocalStorage)

> [!CRITICAL]
> **قانون قطعی و اجباری کنترل دسترسی و ذخیره‌سازی صددرصدی در پایگاه داده پستگرس (MANDATORY POSTGRESQL-AUTHORITATIVE RBAC & ACCESS CONTROL RULE)**
> **تمامی تنظیمات امنیتی، سطوح دسترسی (RBAC)، پالیسی‌های دسترسی، هویت‌ها، گروه‌ها، محدوده‌های دسترسی به تجهیزات (Device Target Scope & Device Grouping) و توکن‌های احراز هویت باید منحصراً و بدون استثنا در پایگاه داده PostgreSQL سرور ذخیره، مدیریت و ارزیابی شوند.**
> 
> All access control policies, permissions, subject assignments, device scopes, device grouping associations, roles, and session validations MUST be stored in and authoritatively calculated by the PostgreSQL database on the server.
> 
> 1. **ممنوعیت مطلق ذخیره یا ارزیابی مسائل امنیتی در لوکال استوریج (Zero Security in LocalStorage)**:
>    - ذخیره‌سازی پالیسی‌های دسترسی، لیست کاربران، گروه‌های کاربری، گروه‌های تجهیزات و تصمیم‌گیری‌های کنترلی در `localStorage` مرورگر اکیداً و بدون قید و شرط ممنوع است. تمام ارزیابی‌های امنیتی باید در سمت سرور و مستقیماً متکی به دیتابیس PostgreSQL باشد.
> 2. **فیلترسازی مبتنی بر دیتابیس در زمان لاگین کاربر (Database-Authoritative Device Scope on User Login)**:
>    - هنگامی که هر کاربری وارد سامانه می‌شود، سرور بر اساس پالیسی مؤثر (Effective Policy) ثبت‌شده در دیتابیس، محدوده تجهیزات مجاز (`targetScope`, `targetGroupIds`, `targetDeviceIds`) را استخراج کرده و اندپوینت‌های دریافت تجهیزات (`/api/devices`) و توپولوژی (`/api/topology`) را به گونه‌ای فیلتر می‌کند که کاربر **فقط و فقط** تجهیزات متعلق به گروه‌ها یا دامنه‌های مجاز خود را دریافت کند.
> 3. **ممانعت سمت سرور از دسترسی مستقیم (Server-Side Endpoint Enforcement)**:
>    - هرگونه درخواست برای مشاهده یا اجرای دستور روی دیوایسی که خارج از محدوده گروه انتخابی در پالیسی دیتابیس باشد، باید بلافاصله با خطای `403 Forbidden` در بک‌اند متوقف گردد.

