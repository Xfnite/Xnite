/**
 * faqClassifier.js
 * Automatic FAQ Question Detection & Operational Categorization
 * Derived from faq_data_cleaning patterns.
 */

const NON_QUESTION_EXCLUSIONS = /^(haha|hahaha|hehe|lol|sana|amen|opo|yes|oo|wala|meron|okay|ok|noted|copy|done|ge|salamat|thanks|ty|good morning|gm|good afternoon|good evening|bye|hi|hello|congrats|laban|sureball|waley parin|kayo ba\??|3dr ata\??|pwedi pala\??)[\s.!,?]*$/i;

const DECLARATIVE_ANSWER_STARTERS = /^(try\b|wait\b|punta ka\b|click\b|hindi po\b|yes po\b|opo\b|oo nga\b|tapusin\b|tposin\b|dapat\b|wag\b|clear user\b|use vpn\b|marereset\b|balik ka\b|basta\b|gawin mo\b|sundin mo\b|follow kayo\b|kayo lang makakaintindi\b)/i;

const ADVICE_EXPLANATION_PATTERNS = /(\b(make sure|mag register kana|para maka pag live task|bayad yun|yun kasi ang active task ngayon|kung pasado mo naman|ask judger po|pwede po basta|pwede naman po|pwede po)\b)/i;

const INQUIRY_PHRASE_REGEX = /\b(ano(ng)?|anu(ng)?|paano|pano|bakit|bkt|kailan|kelan|saan|san|pwede( po)? ba|pede( po)? ba|meron( po)? ba|mayroon( po)? ba|may .* ba|matagal ba|how (to|can|do)|what (is|to|do)|why|when|where|can (i|we)|is it|ask (lang|ko lang)|tanong ko lang|tanong lang|patulong)\b/i;

const INTENT_PATTERNS = [
  // --- 1. SALARY, PAYOUTS & RATES ---
  {
    category: "Salary, Payouts & Rates",
    intent: "Salary Delay & Payout Release Status",
    regex: /(wala pa din.*(sahod|payout)|may (naka|update.*)?(sahod|payout)|delayed?.*(sahod|payout)|pending.*(sahod|payout)|kelan.*(papasok|sahod|payout)|kailan.*(sahod|payout)|update.*sahod|distribution.*sahod|when kaya papasok|na send na ba.*sahod|status.*sending|bakit delay.*sahod|no update sa sahod|ilang days.*delay|wala pa ding sahod|kailan papasok sahod)/i
  },
  {
    category: "Salary, Payouts & Rates",
    intent: "Cut-off Schedules & Payout Dates",
    regex: /(kailan.*next cut ?off|kelan.*cut ?off|cut ?off.*kailan|cut ?off.*kelan|tuwing kailan.*cut ?off|kada 15 days|pano ba pasahod|schedule.*sahod|kelan ang cut off|petsa ng sahod|tuwing kelan.*sahod)/i
  },
  {
    category: "Salary, Payouts & Rates",
    intent: "Withdrawal Process & Minimum Balance",
    regex: /(minimum withdrawal|withdraw.*(d2|dito|ba)|withdrawal.*bank|payout via bank|withdraw.*wallet|paano mag withdraw|pano mag withdraw|issue.*with withdrawal|naka withdraw na ba)/i
  },
  {
    category: "Salary, Payouts & Rates",
    intent: "Task Rates & Earnings Computation",
    regex: /(rate na map|rate sa centerline|magkano.*rate|ano mas malaki.*rate|sahurin.*task|magkano sahod|computation.*sahod|rate per task|rate ng map|magkano kita|per hour)/i
  },

  // --- 2. GINGER SOFTWARE & TECH ISSUES ---
  {
    category: "Ginger App & Technical",
    intent: "App Freeze, Crash & USER Folder Cleanup",
    regex: /(not responding.*ginger|ginger.*not responding|nag zoom.*not responding|freeze|fatal crash.*software|crash.*3d|clear.*user folder|delete.*user folder|linis.*files|mag back to zero.*delete user|hang.*ginger|black screen.*ginger)/i
  },
  {
    category: "Ginger App & Technical",
    intent: "Software Auto-Update & Version Errors",
    regex: /(invalid software version|software will upgrade itself|update.*ginger|ginger.*update|stuck.*update|matagal.*update.*ginger|upgrade itself|download failed.*update|failed to update)/i
  },
  {
    category: "Ginger App & Technical",
    intent: "Download, VC-Redist & Installation Setup",
    regex: /(paano.*download.*ginger|pano.*download.*ginger|download.*vc[- ]?redists?|vc redists?|extract.*ginger|7 zip|install.*ginger|paano ma-download ulit ginger|saan idownload ang ginger|link.*download)/i
  },
  {
    category: "Ginger App & Technical",
    intent: "VPN Requirement & Server Location",
    regex: /(use vpn|vpn.*ginger|ginger.*vpn|anong server.*vpn|nearest server|singapore.*server|need ba.*vpn|proton vpn|bakit kailangan ng vpn)/i
  },
  {
    category: "Ginger App & Technical",
    intent: "Mobile Phone / CP Compatibility",
    regex: /(ginger.*sa (cp|cellphone|phone|android|ios)|pwede.*(cp|cellphone)|download.*ginger sa cp|applicable.*cp|pwede ba sa cellphone|pwede ba sa phone|pwede sa tablet)/i
  },

  // --- 3. TRAINING & ONBOARDING ---
  {
    category: "Training & Onboarding",
    intent: "Pausing Training & Resuming Next Day",
    regex: /(ipagpatuloy bukas|tuloy bukas|pwede ba bukas|bukas nalang|pwede.*bukas na lang|at your own (pace|phase)|pause.*training|pwede ba bukas ituloy|ituloy mamaya)/i
  },
  {
    category: "Training & Onboarding",
    intent: "Training Timer Timeout & Reset Rules",
    regex: /(naabotan ng time|mag restart ba|restart.*training|oras.*training|timer.*training|uulit sa simula|pag naubusan ng time|countdown timer)/i
  },
  {
    category: "Training & Onboarding",
    intent: "Task Submission Shortcuts (Ctrl+A / Ctrl+D / Save)",
    regex: /(pano.*submit.*training|paano.*submit.*training|ctrl a|ctrl d|ctrl t|click na ako ng save.*walang nangyayari|submit.*task|after isubmit po ba|paano isubmit)/i
  },
  {
    category: "Training & Onboarding",
    intent: "Next Training Module & Unlocking Progress",
    regex: /(next training|san makikita.*next training|saan.*next training|tapos na po sa.*training|module 2|saan makikita.*module|roof training|landcover training|standard bldg|paano pumunta sa next training|next step matapos training)/i
  },

  // --- 4. ACCOUNT & CREDENTIALS ---
  {
    category: "Account & Credentials",
    intent: "Ginger Login Credentials (Username & Password)",
    regex: /(log ?in sa ginger|login.*ginger|user.*password.*ginger|saan.*makukuha.*login|username at password.*log ?in|credentials.*ginger|meron na kayo username at password|ayaw mag login sa ginger)/i
  },
  {
    category: "Account & Credentials",
    intent: "Labeler ID Location in Dashboard",
    regex: /(labeler id|saan.*labeler id|san.*labeler id|account info.*labeler id|nasaan.*labeler id|saan makikita ang labeler id|ano ang labeler id)/i
  },
  {
    category: "Account & Credentials",
    intent: "Account Info Locked / Pending Modules",
    regex: /(naka lock.*account info|lock.*acc info|naka lock pa yung account|unlock.*account info|bakit naka lock ang account info|paano ma unlock account info)/i
  },

  // --- 5. PROJECTS & TASKS ---
  {
    category: "Projects & Tasks",
    intent: "Checker & Judger Assignment Timeline",
    regex: /(kelan.*checker|kailan.*checker|mag kakaroon ng checker|wla pang checker|no checker|judger|kailan.*judger|walang checker|kelan po kaya ako mag kakaroon ng checker|sino checker ko)/i
  },
  {
    category: "Projects & Tasks",
    intent: "Task Checking Duration & Approval",
    regex: /(matagal ba ckecking|matagal ba checking|hintayin.*macheck|check.*task|kailan macheck|makikita ng checker ang actual task|ilang oras bago ma check)/i
  },

  // --- 6. DASHBOARD & SYSTEM FEATURES ---
  {
    category: "Dashboard & Platform",
    intent: "Performance Query & Hours Monitoring",
    regex: /(walang lumalabas.*performance query|performance query|hindi lumalabas.*stats|bakit zero.*task|may dashboard ba para mamonitor|ilan hours kana|machecheck ang oras)/i
  }
];

export function isGenuineQuestion(text) {
  if (!text || typeof text !== "string") return false;
  const clean = text.trim();
  if (clean.length < 5) return false;
  if (NON_QUESTION_EXCLUSIONS.test(clean)) return false;
  if (DECLARATIVE_ANSWER_STARTERS.test(clean)) return false;
  if (ADVICE_EXPLANATION_PATTERNS.test(clean)) return false;

  const hasQuestionMark = clean.includes("?");
  const hasInquiryPhrase = INQUIRY_PHRASE_REGEX.test(clean);

  return hasQuestionMark || hasInquiryPhrase;
}

export function classifyFaq(text) {
  const clean = text ? text.trim() : "";
  for (const rule of INTENT_PATTERNS) {
    if (rule.regex.test(clean)) {
      return {
        category: rule.category,
        intent: rule.intent
      };
    }
  }

  return {
    category: "General Inquiries",
    intent: "Community Inquiries"
  };
}
