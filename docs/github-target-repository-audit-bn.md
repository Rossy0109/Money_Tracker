# GitHub লক্ষ্য রিপোজিটরি নিরীক্ষা

**তারিখ:** ২৪ আগস্ট ২০২৬ (GMT+৬)  
**লক্ষ্য URL:** <https://github.com/Rossy0109/Money_Tracker>

## প্রাথমিক পর্যবেক্ষণ

লক্ষ্য রিপোজিটরিটি `Rossy0109/Money_Tracker` নামে একটি বিদ্যমান **public** রিপোজিটরি। প্রকাশ্য `main` শাখায় এটি বর্তমান money-tracker অ্যাপের repository identity নয়: একাধিক ভিন্ন source tree, tool-configuration এবং পুরোনো/আলাদা project directory রয়েছে। প্রকাশ্য তালিকায় `Foot_Print_of_Money`, `app`, `components`, `pwa`, `supabase`, `backups` ও বহু tool-specific directory দেখা গেছে।

এই workspace-এর চলমান React/Express/Drizzle money-tracker code এখন আলাদা, private Git remote `Rossy0109/my-hisab`-এ sync করা ছিল। যাচাইয়ের সময় স্থানীয় অ্যাপ ও `my-hisab/main` উভয়ই revision `eb920ecc8eae3250a845f07e75b1bb298157ca68`-এ ছিল। অন্যদিকে `Money_Tracker/main` revision `b12ba1fd92aff1ebdc8dd7af68fabec1434f470b` এবং public ছিল। তাই `Money_Tracker`-কে একমাত্র পরিষ্কার source of truth করতে হলে পুরোনো remote history/files প্রতিস্থাপন বা আলাদা clean branch তৈরি করতে হবে। ইতিহাস প্রতিস্থাপন ধ্বংসাত্মক Git operation; ব্যবহারকারীর স্পষ্ট অনুমোদন ছাড়া এটি করা হবে না।

## নিরাপদ পরবর্তী সিদ্ধান্ত

স্থানীয় ও উভয় remote-এর branch/file inventory যাচাই করা হয়েছে। লক্ষ্য `main`-এ ৫৬০ MB-এর বেশি fetched Git object এবং `Foot_Print_of_Money`, `app`, `components`, `pwa`, `supabase`, `.next`, `firebase` ইত্যাদিসহ একাধিক পৃথক technology/project tree পাওয়া গেছে। বর্তমান application tree-তে React/Express/Drizzle-নির্ভর `client`, `server`, `drizzle`, `shared`, `tests`, CI এবং documentation রয়েছে।

ব্যবহারকারীর অনুমোদিত প্রতিস্থাপনের আগে পুরোনো `Money_Tracker/main` revision `b12ba1fd92aff1ebdc8dd7af68fabec1434f470b` একই remote-এ `backup/pre-money-tracker-main-20260824` branch হিসেবে সংরক্ষণ করা হয়েছে। ফলে নতুন `main` অসুবিধাজনক হলে পুরোনো উৎস উদ্ধারযোগ্য থাকবে।

## GitHub Pages পর্যবেক্ষণ

২৪ আগস্ট ২০২৬ (GMT+৬)-এ <https://rossy0109.github.io/Money_Tracker/> পরীক্ষা করা হয়েছে। URL-টি বর্তমানে GitHub Pages-এর **404 File not found** পৃষ্ঠা দেয়; অর্থাৎ এখানে চলমান সাইট নেই। বর্তমান money-tracker একটি Express server, tRPC API, OAuth এবং MySQL/TiDB-নির্ভর full-stack অ্যাপ—সুতরাং কেবল GitHub Pages-এ static file push করে পূর্ণ অ্যাপ চালানো যাবে না। বর্তমান live application endpoint হলো Manus managed deployment: <https://moneytrack-2tqvjvuy.manus.space>।
