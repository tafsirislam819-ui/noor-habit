# Noor Habit — Email Setup & 100% Inbox Delivery Guide

## 1. How to add the Branded Noor Habit Email Templates to Supabase

1. Open your **Supabase Dashboard**: [https://supabase.com/dashboard/project/ahyiwiguhpmyoyavhyrv/auth/templates](https://supabase.com/dashboard/project/ahyiwiguhpmyoyavhyrv/auth/templates)
2. Go to **Authentication** -> **Email Templates**.

### A. Confirm signup Template:
- Select **"Confirm signup"**.
- Set **Subject**: `Verify your Noor Habit account (Code: {{ .Token }})`
- In the **Body** box, paste the entire content from `email-templates/confirm-signup.html`.
- Click **Save**.

### B. Reset Password Template:
- Select **"Reset Password"**.
- Set **Subject**: `Reset your Noor Habit password (Code: {{ .Token }})`
- In the **Body** box, paste the entire content from `email-templates/reset-password.html`.
- Click **Save**.

---

## 2. How to ensure emails NEVER go to the Spam folder (100% Inbox Delivery)

### Why default Supabase emails sometimes land in Spam:
Supabase provides a free built-in email service for quick testing, but it sends from a shared domain (`noreply@mail.app.supabase.io`). Because thousands of free tier projects share that domain and send emails, major providers like Gmail, Yahoo, and Outlook often flag or throttle shared domain emails into the Spam or Promotions folder.

### The Solution: Enable Custom SMTP (Free & takes 3 minutes)
You can connect a free custom SMTP provider such as **Resend** (3,000 free emails/month), **Brevo** (300 free emails/day), or **SendGrid**.

1. Create a free account at **[Resend.com](https://resend.com)**.
2. Add your custom domain (or subdomain like `mail.yourdomain.com`).
3. Add the 3 standard DNS records Resend gives you to your domain host:
   - **SPF** (TXT record: `v=spf1 include:amazonses.com ~all`)
   - **DKIM** (CNAME record: verifies your sender authenticity)
   - **DMARC** (TXT record: `v=DMARC1; p=none;`)
4. Create an API key in Resend.
5. In your **Supabase Dashboard**:
   - Go to **Project Settings** -> **Authentication** -> **SMTP Settings**.
   - Enable **Custom SMTP**.
   - Host: `smtp.resend.com`
   - Port: `465` (or `587`)
   - User: `resend`
   - Password: `re_YourResendApiKey`
   - Sender Email: `noreply@yourdomain.com` (or your verified domain email)
   - Sender Name: `Noor Habit`
6. Click **Save**.

Once SPF and DKIM are verified on your domain, emails sent to Gmail, Apple Mail, and Outlook will have a **10/10 deliverability score** and will arrive straight to the primary **Inbox** with your official brand badge!
