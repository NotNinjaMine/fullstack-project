// Minimal translation layer.
//
// SCOPE: right now this only covers the "Details" tab of the My account panel
// (components/ProfilePanel.jsx). Every other screen is still hardcoded English.
// The structure is deliberately the shape a full rollout would use, so
// translating another screen means adding its keys here and swapping that
// screen's literals for t("..."), with no change to this file's design.
//
// Keys are namespaced by area ("profile.*") so a later rollout can add
// "employee.*", "approver.*", etc. without collisions.

export const LOCALES = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "th", label: "ไทย" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "ms", label: "Bahasa Melayu" },
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ja", label: "日本語" },
];

export const DEFAULT_LOCALE = "en";

// English is the reference set: any key added here must exist in every other
// locale below, or checkDictionaries() (bottom of file) will report the gap.
const DICT = {
  en: {
    "profile.myAccount": "My account",
    "profile.tabDetails": "Details",
    "profile.tabPassword": "Password",
    "profile.tabAuthenticator": "Authenticator",
    "profile.tabSessions": "Sessions",
    "profile.tabSecurityLog": "Security log",
    "profile.editYourDetails": "Edit your details",
    "profile.name": "Name",
    "profile.phone": "Phone",
    "profile.emailReadOnly": "Email (read-only)",
    "profile.preferredLanguage": "Preferred language",
    "profile.emailNotifications": "Email notifications",
    "profile.inAppNotifications": "In-app notifications",
    "profile.managedByHr": "Role, country and team are set by HR and cannot be changed here.",
    "profile.saveChanges": "Save changes",
    "profile.saving": "Saving…",
    "profile.updated": "Profile updated.",
    "profile.updateFailed": "Update failed.",
  },
  zh: {
    "profile.myAccount": "我的账户",
    "profile.tabDetails": "详细资料",
    "profile.tabPassword": "密码",
    "profile.tabAuthenticator": "身份验证器",
    "profile.tabSessions": "登录会话",
    "profile.tabSecurityLog": "安全日志",
    "profile.editYourDetails": "编辑您的资料",
    "profile.name": "姓名",
    "profile.phone": "电话",
    "profile.emailReadOnly": "电子邮件（只读）",
    "profile.preferredLanguage": "首选语言",
    "profile.emailNotifications": "电子邮件通知",
    "profile.inAppNotifications": "应用内通知",
    "profile.managedByHr": "职位、国家和团队由人力资源部设置，无法在此更改。",
    "profile.saveChanges": "保存更改",
    "profile.saving": "保存中…",
    "profile.updated": "资料已更新。",
    "profile.updateFailed": "更新失败。",
  },
  th: {
    "profile.myAccount": "บัญชีของฉัน",
    "profile.tabDetails": "ข้อมูลส่วนตัว",
    "profile.tabPassword": "รหัสผ่าน",
    "profile.tabAuthenticator": "แอปยืนยันตัวตน",
    "profile.tabSessions": "เซสชัน",
    "profile.tabSecurityLog": "บันทึกความปลอดภัย",
    "profile.editYourDetails": "แก้ไขข้อมูลของคุณ",
    "profile.name": "ชื่อ",
    "profile.phone": "โทรศัพท์",
    "profile.emailReadOnly": "อีเมล (อ่านได้เท่านั้น)",
    "profile.preferredLanguage": "ภาษาที่ต้องการ",
    "profile.emailNotifications": "การแจ้งเตือนทางอีเมล",
    "profile.inAppNotifications": "การแจ้งเตือนในแอป",
    "profile.managedByHr": "ตำแหน่ง ประเทศ และทีม กำหนดโดยฝ่ายบุคคล และไม่สามารถเปลี่ยนแปลงได้ที่นี่",
    "profile.saveChanges": "บันทึกการเปลี่ยนแปลง",
    "profile.saving": "กำลังบันทึก…",
    "profile.updated": "อัปเดตข้อมูลแล้ว",
    "profile.updateFailed": "อัปเดตไม่สำเร็จ",
  },
  vi: {
    "profile.myAccount": "Tài khoản của tôi",
    "profile.tabDetails": "Thông tin",
    "profile.tabPassword": "Mật khẩu",
    "profile.tabAuthenticator": "Ứng dụng xác thực",
    "profile.tabSessions": "Phiên đăng nhập",
    "profile.tabSecurityLog": "Nhật ký bảo mật",
    "profile.editYourDetails": "Chỉnh sửa thông tin của bạn",
    "profile.name": "Tên",
    "profile.phone": "Số điện thoại",
    "profile.emailReadOnly": "Email (chỉ đọc)",
    "profile.preferredLanguage": "Ngôn ngữ ưa thích",
    "profile.emailNotifications": "Thông báo qua email",
    "profile.inAppNotifications": "Thông báo trong ứng dụng",
    "profile.managedByHr": "Vai trò, quốc gia và nhóm do bộ phận Nhân sự thiết lập và không thể thay đổi ở đây.",
    "profile.saveChanges": "Lưu thay đổi",
    "profile.saving": "Đang lưu…",
    "profile.updated": "Đã cập nhật thông tin.",
    "profile.updateFailed": "Cập nhật không thành công.",
  },
  ms: {
    "profile.myAccount": "Akaun saya",
    "profile.tabDetails": "Maklumat",
    "profile.tabPassword": "Kata laluan",
    "profile.tabAuthenticator": "Aplikasi pengesah",
    "profile.tabSessions": "Sesi",
    "profile.tabSecurityLog": "Log keselamatan",
    "profile.editYourDetails": "Sunting maklumat anda",
    "profile.name": "Nama",
    "profile.phone": "Telefon",
    "profile.emailReadOnly": "E-mel (baca sahaja)",
    "profile.preferredLanguage": "Bahasa pilihan",
    "profile.emailNotifications": "Pemberitahuan e-mel",
    "profile.inAppNotifications": "Pemberitahuan dalam aplikasi",
    "profile.managedByHr": "Peranan, negara dan pasukan ditetapkan oleh HR dan tidak boleh diubah di sini.",
    "profile.saveChanges": "Simpan perubahan",
    "profile.saving": "Menyimpan…",
    "profile.updated": "Profil telah dikemas kini.",
    "profile.updateFailed": "Kemas kini gagal.",
  },
  id: {
    "profile.myAccount": "Akun saya",
    "profile.tabDetails": "Detail",
    "profile.tabPassword": "Kata sandi",
    "profile.tabAuthenticator": "Aplikasi autentikator",
    "profile.tabSessions": "Sesi",
    "profile.tabSecurityLog": "Log keamanan",
    "profile.editYourDetails": "Ubah detail Anda",
    "profile.name": "Nama",
    "profile.phone": "Telepon",
    "profile.emailReadOnly": "Email (hanya baca)",
    "profile.preferredLanguage": "Bahasa pilihan",
    "profile.emailNotifications": "Notifikasi email",
    "profile.inAppNotifications": "Notifikasi dalam aplikasi",
    "profile.managedByHr": "Peran, negara, dan tim ditetapkan oleh HRD dan tidak dapat diubah di sini.",
    "profile.saveChanges": "Simpan perubahan",
    "profile.saving": "Menyimpan…",
    "profile.updated": "Profil diperbarui.",
    "profile.updateFailed": "Pembaruan gagal.",
  },
  ja: {
    "profile.myAccount": "マイアカウント",
    "profile.tabDetails": "基本情報",
    "profile.tabPassword": "パスワード",
    "profile.tabAuthenticator": "認証アプリ",
    "profile.tabSessions": "セッション",
    "profile.tabSecurityLog": "セキュリティログ",
    "profile.editYourDetails": "情報を編集",
    "profile.name": "氏名",
    "profile.phone": "電話番号",
    "profile.emailReadOnly": "メールアドレス（変更不可）",
    "profile.preferredLanguage": "表示言語",
    "profile.emailNotifications": "メール通知",
    "profile.inAppNotifications": "アプリ内通知",
    "profile.managedByHr": "役職・国・チームは人事部が設定するため、ここでは変更できません。",
    "profile.saveChanges": "変更を保存",
    "profile.saving": "保存中…",
    "profile.updated": "プロフィールを更新しました。",
    "profile.updateFailed": "更新に失敗しました。",
  },
};

/**
 * Build a lookup function for one locale.
 *
 * Falls back in two steps so a missing translation can never render as a blank
 * label: the English string first, then the key itself (which is obvious in the
 * UI and easy to trace) rather than "undefined".
 *
 * @param {string} locale e.g. "zh". Unknown/absent locales use English.
 * @returns {(key: string) => string}
 */
export const translator = (locale) => {
  const table = DICT[locale] || DICT[DEFAULT_LOCALE];
  return (key) => table[key] ?? DICT[DEFAULT_LOCALE][key] ?? key;
};

/**
 * Dev/test helper: report any locale missing a key that English defines (or
 * carrying one English doesn't). Used by the translation test rather than
 * shipped UI, so a half-translated string can't slip in unnoticed.
 * @returns {{ locale: string, missing: string[], extra: string[] }[]}
 */
export const checkDictionaries = () => {
  const reference = Object.keys(DICT[DEFAULT_LOCALE]);
  return Object.keys(DICT)
    .filter((code) => code !== DEFAULT_LOCALE)
    .map((code) => {
      const keys = Object.keys(DICT[code]);
      return {
        locale: code,
        missing: reference.filter((k) => !keys.includes(k)),
        extra: keys.filter((k) => !reference.includes(k)),
      };
    })
    .filter((r) => r.missing.length > 0 || r.extra.length > 0);
};

export { DICT };
