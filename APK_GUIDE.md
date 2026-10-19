# Noor Habit — APK বানানোর গাইড

1. পিসিতে Node.js, Android Studio ইনস্টল করুন।
2. ZIP খুলে ফোল্ডারে: `npm install`
3. Lovable-এ অ্যাপ Publish করুন। তারপর `.env` ফাইলে লিখুন: `VITE_API_BASE=https://আপনার-published-লিংক`
   (এটা AI চ্যাট আর আপডেট চেক করার জন্য লাগবে)
4. `npm run build` তারপর `npx cap add android` (প্রথমবার শুধু) তারপর `npx cap sync android`
5. `npx cap open android` → Android Studio-তে Build → Build APK(s)।
6. Android অনুমতি: Notifications (Android 13+), Exact alarms (SCHEDULE_EXACT_ALARM) — অ্যালার্ম ধরনের নোটিফিকেশন ঠিক সময়ে বাজানোর জন্য।

## আপডেট দেওয়া
- `src/lib/update.ts`-এ APP_VERSION বাড়ান, নতুন APK বানান, কোথাও (যেমন Google Drive/GitHub Releases) আপলোড করুন।
- `public/version.json`-এ নতুন version আর apkUrl দিন, তারপর Publish করুন। বন্ধুরা Settings → "আপডেট চেক করুন" চাপলেই নতুন APK নামবে।

## এখনো বাকি / আপনার কাছ থেকে যা লাগবে
- বন্ধু, র‍্যাঙ্কিং, Google/Facebook লগইন: আপনার Supabase যুক্ত করতে হবে।
- YouTube/FB/WhatsApp-এ কাটানো সময় আর Reels গোনা: Android Usage Access অনুমতি আর আলাদা native প্লাগইন লাগবে (এখনো যুক্ত হয়নি)।
