import type { Strings } from './en'

export const ar: Strings = {
  app: {
    documentTitle: 'Hams.AI — المراقبة المباشرة',
    title: 'المراقبة المباشرة',
    selectConversation: 'اختر محادثة',
    retry: 'إعادة المحاولة',
  },
  language: {
    label: 'اللغة',
  },
  connection: {
    connecting: 'جارٍ الاتصال…',
    connected: 'متصل',
    reconnecting: 'جارٍ إعادة الاتصال…',
    lastEvent: (id) => `آخر حدث #${id}`,
  },
  status: {
    ai: 'مع الذكاء الاصطناعي',
    needs_human: 'تحتاج موظفًا',
    human: 'مع موظف',
    closed: 'مغلقة',
  },
  list: {
    label: 'المحادثات',
    loading: 'جارٍ تحميل المحادثات…',
    loadFailed: 'تعذّر تحميل المحادثات',
    aiTyping: 'الذكاء الاصطناعي يكتب…',
    unread: (n) => `${n} غير مقروءة`,
  },
  thread: {
    label: 'المحادثة',
    messages: 'الرسائل',
    loading: 'جارٍ تحميل الرسائل…',
    loadFailed: 'تعذّر تحميل الرسائل',
    newMessages: 'رسائل جديدة ↓',
    typing: 'يكتب',
    sending: 'جارٍ الإرسال…',
    sent: 'أُرسلت',
    role: {
      customer: 'العميل',
      ai: 'الذكاء الاصطناعي',
      human: 'المشرف',
    },
  },
  handoff: {
    region: 'التحويل',
    transferred: 'حُوّلت إلى موظف',
    aiAsked: 'طلب الذكاء الاصطناعي تدخّل موظف.',
    reasonUnknown: 'السبب غير متاح — تم التحويل قبل بدء هذه الجلسة.',
    takeOver: 'تولَّ المحادثة',
    takingOver: 'جارٍ تولّي المحادثة…',
  },
  composer: {
    label: 'الرد',
    placeholder: 'اكتب ردًا…',
    disabled: {
      ai: 'الذكاء الاصطناعي يتولى هذه المحادثة',
      needs_human: 'تولَّ المحادثة لتتمكن من الرد',
      closed: 'هذه المحادثة مغلقة',
    },
    send: 'إرسال',
    sendFailed: 'تعذّر إرسال',
    dismiss: 'تجاهل',
  },
}
