# SRU_IDENTITY.md
## الهوية البصرية — جامعة سليمان الراجحي

> هذا الملف هو **المصدر الوحيد للحقيقة** للهوية البصرية في كل واجهات مشاريع جامعة سليمان الراجحي.
> يُطبَّق على أي عمل واجهة (UI) داخل هذا الـ Project دون الحاجة لإعادة ذكره.
> يُكمل `UI_HANDOVER.md` (طبقة الهوية البصرية).

---

## CSS Tokens (المصدر الرسمي)

```css
:root {
  /* الألوان الأساسية */
  --sru-purple:        #501e8c;            /* البنفسجي الرئيسي */
  --sru-purple-dark:   #3a1464;            /* البنفسجي الداكن */
  --sru-purple-light:  #f0ebf8;            /* البنفسجي الفاتح */

  /* الألوان الثانوية */
  --sru-blue:          #0a6eaa;            /* الأزرق الثانوي */
  --sru-blue-light:    #e6f3fa;            /* الأزرق الفاتح */

  /* الخلفيات والحدود */
  --sru-bg:            #f7f5fb;            /* خلفية الصفحة */
  --sru-border:        rgba(80,30,140,0.12);
}
```

---

## الاتجاه والخط والأيقونات

- **الاتجاه:** RTL كامل (افتراضي لكل الصفحات).
- **الخط:** Cairo — الأسلم عبر كل المنصات (من Google Fonts)، مع بدائل احتياطية:
  `font-family: "Cairo", Tahoma, Arial, sans-serif;`
  المصدر: https://fonts.google.com/specimen/Cairo
- **الأيقونات:** Lucide Icons حصراً (عبر CDN).
- **الثيم:** فاتح (light).

---

## الهيدر (Header)

طبقة أو طبقتان حسب الأنسب للتصميم المطلوب:

- **topbar** (الطبقة العلوية): خلفية داكنة `--sru-purple-dark` (#3a1464).
- **navbar** (طبقة التنقل): خلفية بنفسجية `--sru-purple` (#501e8c).

---

## الأزرار (Buttons)

**الزر الرئيسي (Primary):**
```css
.btn-primary {
  background: var(--sru-purple);   /* #501e8c */
  color: #ffffff;
  border-radius: 4px;
  border: none;
}
```

**الزر الثانوي (Secondary):**
```css
.btn-secondary {
  background: #ffffff;
  color: var(--sru-purple);        /* #501e8c */
  border: 1px solid var(--sru-purple);
  border-radius: 4px;
}
```

---

## الشعار (Logo)

ثلاث صيغ في معرفة المشروع:
- `sru-logo-transparent.png` — ملوّن بخلفية شفافة، للخلفيات الفاتحة.
- `sru-logo-white.png` — أبيض بخلفية شفافة، للخلفيات الداكنة.
- `sru-logo.pdf` — الأصل عالي الدقة (مرجع/مصدر).

قاعدة الاستخدام:
- خلفية داكنة (topbar #3a1464) ← `sru-logo-white.png`.
- خلفية فاتحة (navbar فاتح / حاوية بيضاء) ← `sru-logo-transparent.png`.
- يُوضع في الهيدر بمحاذاة RTL (يمين الشاشة).

---

## وسوم اليقين

- الألوان والاتجاه والخط وأنماط الأزرار والشعار: **موثّقة من مصدر رسمي** قدّمه مالك المشروع.
