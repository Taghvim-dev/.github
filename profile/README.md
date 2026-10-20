<div align="center">

# تقویم.dev™ | Taghvim.dev

### زیرساخت برنامه‌پذیر زمان برای محصولات ایرانی
**Build with time. Not around it.**

قابلیت‌های تقویم شمسی، میلادی و قمری، تعطیلات، روزهای کاری، سررسید، زمان‌بندی و رزرو؛ در قالب رابط‌های نسخه‌دار.

[وب‌سایت](https://taghvim.dev/) · [مرجع API](https://taghvim.dev/#api-explorer) · [آزمایشگاه تاریخ](https://taghvim.dev/#playground) · [درخواست دسترسی زودهنگام](https://taghvim.dev/#access)

</div>

## چه مسئله‌ای را حل می‌کنیم؟
از تبدیل تاریخ و بررسی روز کاری تا زمان‌بندی و محاسبهٔ سررسید، یک تعریف سازگار از زمان به محصولات مختلف کمک می‌کند.

```mermaid
flowchart TB
    A["برنامه یا سازمان"] --> B["رابط تقویم.dev"]
    B --> C["تبدیل تاریخ"]
    B --> D["روز کاری و تعطیلات"]
    B --> E["زمان‌بندی و رزرو"]
    B --> F["سررسید و رویداد"]
    C --> G["پاسخ نسخه‌دار"]
    D --> G
    E --> G
    F --> G
```

## شروع برای توسعه‌دهندگان
- [راهنمای شروع و وضعیت دسترسی](../docs/DEVELOPER-ONBOARDING.md)
- [Quickstart برای API](../docs/API-QUICKSTART.md)
- [نمونهٔ JavaScript](../examples/javascript/convert-date.mjs) و [Python](../examples/python/convert_date.py)
- [Cookbooks](../docs/COOKBOOKS.md) · [نقشهٔ قابلیت‌ها](../docs/CAPABILITY-MAP.md)
- [پشتیبانی](../SUPPORT.md) · [امنیت](../SECURITY.md) · [سیاست IP/OSS](../IP-AND-OSS.md)

**وضعیت:** Early Access. ابزارهای آزمایشی وب‌سایت ممکن است در مرورگر اجرا شوند. دسترسی واقعی به API و کلید آزمایشی نیازمند دعوت و فعال‌سازی است؛ **صدور عمومی خودکار کلید هنوز تأیید نشده است**.

## برای چه محصولاتی؟
نرم‌افزارهای سازمانی، تجارت و خدمات، مالی، درمان، لجستیک، حقوق و منابع انسانی. پشتیبانی کامل از زنجیره‌های مستقل B2B2B2C یک **هدف محصول** است، نه ادعای پیاده‌سازی کامل فعلی.

---

**English:** Taghvim.dev offers programmable calendar and time capabilities. [Request early access](https://taghvim.dev/#access), then explore [developer documentation](../docs/API-QUICKSTART.md).

Public developer documentation and examples in this repository: Apache-2.0. Trademarks reserved; see [NOTICE](../NOTICE).
