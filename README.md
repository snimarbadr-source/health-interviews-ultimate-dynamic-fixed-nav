# مقابلات الصحة — نشر على Vercel

## تشغيل محلياً
افتح `index.html` مباشرة أو شغّل أي سيرفر محلي.

## نشر على Vercel (GitHub → Vercel)
1) ارفع محتويات المشروع إلى GitHub (تأكد أن `index.html` موجود في جذر الريبو).
2) في Vercel: New Project → اختر الريبو.
3) Framework Preset: **Other**
4) Build Command: **None**
5) Output Directory:
   - اتركها فاضية **أو**
   - اكتب: `public`

> ملاحظة: هذا المشروع يحتوي نسخة جاهزة داخل `public/` + نسخة في الجذر، لذلك سيعمل في الحالتين.
