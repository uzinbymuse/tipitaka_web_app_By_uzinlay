/**
 * Tipitaka Pali & Myanmar Web Reader - Unified Controller
 */

// Application State
const state = {
    // Mode: 'pali' | 'mm' | 'split'
    readerMode: localStorage.getItem("tipitaka_reader_mode") || "pali",
    
    // Pali State
    paliBookId: "mula_vi_01",
    paliBookName: "ပါရာဇိကပါဠိ",
    paliPage: 1,
    paliFirstPage: 1,
    paliLastPage: 381,
    paliTocs: [],
    paliSuttas: [],
    paliRelated: [],
    matchingMM: null,
    companionData: null,

    // Dynamic Companion Split View State
    splitRightType: localStorage.getItem("tipitaka_split_comp_type") || "attha", // 'attha' | 'tika' | 'mula' | 'mm'
    splitRightBookId: null,
    splitRightBookName: "",
    splitRightPage: 1,
    splitRightLastPage: 1,

    // Myanmar State
    mmBookId: "01_vinaya_01",
    mmBookName: "ပါရာဇိကဏ်",
    mmPage: 1,
    mmFirstPage: 1,
    mmLastPage: 434,
    mmTocs: [],
    mmSuttas: [],
    matchingPali: null,

    // Shared collections
    paliCategories: [],
    mmCategories: [],
    bookmarks: [],
    activeTab: "tab-books",
    activeBasket: "mula",
    appView: "home",
    homeBasket: "mula",
    searchMode: "word",
    searchBookScope: "all", // "all" = every book, "current" = the book now open
    theme: localStorage.getItem("tipitaka_theme") || "paper",
    fontSize: parseInt(localStorage.getItem("tipitaka_font_size") || "100", 10),
    isDictOpen: window.innerWidth > 992 && (localStorage.getItem("tipitaka_dict_open") === "1"),
    isSidebarOpen: window.innerWidth > 992,
    showNotes: localStorage.getItem("tipitaka_show_notes") === "1",
    showNissaya: localStorage.getItem("tipitaka_show_nissaya") === "1",
    scrollMode: (function() {
        const m = localStorage.getItem("tipitaka_scroll_mode");
        if (m === "single") return "single";
        localStorage.setItem("tipitaka_scroll_mode", "feed");
        return "feed";
    })(),
    feedLoadedPages: new Set(),
    feedFirstLoadedPage: 1,
    feedLastLoadedPage: 1,
    feedSessionId: 0,
    isLoadingMore: false,
    historyActiveTab: "reading",
    historyModeFilter: "all",
    isFocusMode: false,
    pendingSearchHighlight: null,
    swapOrigin: null,
    isActionSheetOpen: false
};

// Printed-volume labels (ဆဋဌမူ ပုံနှိပ်တွဲ) for books in multi-volume nikayas,
// so a reader holding the physical book knows which app-book belongs to which
// printed volume (e.g. စတုက္ကနိပါတပါဠိ → အံ၊ ပတွဲ).
// Derived from the DB's own print pagination (verified 2026-09-30 against
// tipitaka_pali.db books.firstpage/lastpage): books whose page ranges run
// continuously (next.firstpage ≈ prev.lastpage + 1) were scanned from ONE bound
// volume; a reset to page 1 starts a new printed volume.
//   အံ ပတွဲ = an_01..04 (pp. 1-580) / ဒုတွဲ = an_05..07 (pp. 1-513) / တတွဲ = an_08..11 (pp. 1-558)
//   သံ ပတွဲ = sa_01..02 / ဒုတွဲ = sa_03..04 / တတွဲ = sa_05
//   ဒီ/မ ပတွဲ/ဒုတွဲ/တတွဲ = one volume per vagga/pannasa
//   ခုဒ္ဒက ပတွဲ = ku_01..05 / ဒုတွဲ = ku_06..09 ; အပဒါန ဒုတွဲ = ku_11..13 (ku_10 is အပဒါန ပ)
//   ဓာတုကထာ+ပုဂ္ဂလပညတ္တိ (bi_03 pp.1-100, bi_04 pp.101-185) and
//   နေတ္တိ+ပေဋကောပဒေသ (ku_20 pp.1-166, ku_21 pp.167-341) are each one bound volume;
//   their spine names follow the first-text convention — correct against the
//   physical books if they differ.
// Aṭṭhakathā/ṭīkā: same pagination rule. Combined vols —
//   attha_vi_02+03 (pp.1-437), attha_vi_04+05 (pp.1-265),
//   attha_sa_02+03 (pp.1-324), attha_sa_04+05 (pp.1-341),
//   attha_an_03+04 (pp.1-357), tika_an_03+04 (pp.1-371),
//   tika_ma_03+04 (pp.1-442), tika_sa_02..05 (pp.1-551).
//   Numbering (ပတွဲ/ဒုတွဲ/တတွဲ/စတွဲ) follows DB order within each work.
// Myanmar-translation labels mirror the Pali print division (MM DB has no attha/tika books).
const VOLUME_LABELS = {
    mula_an_01: "အံ၊ ပတွဲ", mula_an_02: "အံ၊ ပတွဲ",
    mula_an_03: "အံ၊ ပတွဲ", mula_an_04: "အံ၊ ပတွဲ",
    mula_an_05: "အံ၊ ဒုတွဲ", mula_an_06: "အံ၊ ဒုတွဲ",
    mula_an_07: "အံ၊ ဒုတွဲ",
    mula_an_08: "အံ၊ တတွဲ", mula_an_09: "အံ၊ တတွဲ",
    mula_an_10: "အံ၊ တတွဲ", mula_an_11: "အံ၊ တတွဲ",
    mula_sa_01: "သံ၊ ပတွဲ", mula_sa_02: "သံ၊ ပတွဲ",
    mula_sa_03: "သံ၊ ဒုတွဲ", mula_sa_04: "သံ၊ ဒုတွဲ",
    mula_sa_05: "သံ၊ တတွဲ",
    mula_di_01: "ဒီ၊ ပတွဲ", mula_di_02: "ဒီ၊ ဒုတွဲ",
    mula_di_03: "ဒီ၊ တတွဲ",
    mula_ma_01: "မ၊ ပတွဲ", mula_ma_02: "မ၊ ဒုတွဲ",
    mula_ma_03: "မ၊ တတွဲ",
    mula_ku_01: "ခုဒ္ဒက၊ ပတွဲ", mula_ku_02: "ခုဒ္ဒက၊ ပတွဲ",
    mula_ku_03: "ခုဒ္ဒက၊ ပတွဲ", mula_ku_04: "ခုဒ္ဒက၊ ပတွဲ",
    mula_ku_05: "ခုဒ္ဒက၊ ပတွဲ",
    mula_ku_06: "ခုဒ္ဒက၊ ဒုတွဲ", mula_ku_07: "ခုဒ္ဒက၊ ဒုတွဲ",
    mula_ku_08: "ခုဒ္ဒက၊ ဒုတွဲ", mula_ku_09: "ခုဒ္ဒက၊ ဒုတွဲ",
    mula_ku_12: "အပဒါန၊ ဒုတွဲ", mula_ku_13: "အပဒါန၊ ဒုတွဲ",
    mula_ku_20: "နေတ္တိတွဲ", mula_ku_21: "နေတ္တိတွဲ",
    mula_bi_03: "ဓာတုကထာတွဲ", mula_bi_04: "ဓာတုကထာတွဲ",
    // ---- Aṭṭhakathā: Vinaya (သမန္တပါသာဒိကာ) — 4 vols; ပါစိတ္တိယ+မဟာဝဂ္ဂ and
    // စူဠဝဂ္ဂ+ပရိဝါရ share continuous pagination (1–437 and 1–265) → one vol each
    attha_vi_01_01: "ဝိ၊ ပတွဲ", attha_vi_01_02: "ဝိ၊ ဒုတွဲ",
    attha_vi_02: "ဝိ၊ တတွဲ", attha_vi_03: "ဝိ၊ တတွဲ",
    attha_vi_04: "ဝိ၊ စတွဲ", attha_vi_05: "ဝိ၊ စတွဲ",
    // ---- Aṭṭhakathā: Dīgha (သုမင်္ဂလဝိလာသိနီ) — one vol per vagga
    attha_di_01: "ဒီ၊ ပတွဲ", attha_di_02: "ဒီ၊ ဒုတွဲ",
    attha_di_03: "ဒီ၊ တတွဲ",
    // ---- Aṭṭhakathā: Majjhima (ပပဉ္စသူနနီ) — 4 vols
    attha_ma_01_01: "မ၊ ပတွဲ", attha_ma_01_02: "မ၊ ဒုတွဲ",
    attha_ma_02: "မ၊ တတွဲ", attha_ma_03: "မ၊ စတွဲ",
    // ---- Aṭṭhakathā: Saṃyutta (သာရတ္ထပ္ပကာသိနီ) — 3 vols; နိဒါန+ခန္ဓ and
    // သဠာယတန+မဟာ share continuous pagination → one vol each
    attha_sa_01: "သံ၊ ပတွဲ",
    attha_sa_02: "သံ၊ ဒုတွဲ", attha_sa_03: "သံ၊ ဒုတွဲ",
    attha_sa_04: "သံ၊ တတွဲ", attha_sa_05: "သံ၊ တတွဲ",
    // ---- Aṭṭhakathā: Aṅguttara (မနောရထပူရဏီ) — 3 vols;
    // ပဉ္စကာဒိ+အဋ္ဌကာဒိ share continuous pagination (1–357) → one vol
    attha_an_01: "အံ၊ ပတွဲ", attha_an_02: "အံ၊ ဒုတွဲ",
    attha_an_03: "အံ၊ တတွဲ", attha_an_04: "အံ၊ တတွဲ",
    // ---- Aṭṭhakathā: Abhidhamma — 3 vols
    attha_bi_01: "အဘိ၊ ပတွဲ", attha_bi_02: "အဘိ၊ ဒုတွဲ",
    attha_bi_03: "အဘိ၊ တတွဲ",
    // ---- Ṭīkā: Aṅguttara — 3 vols; ပဉ္စကာဒိ+အဋ္ဌကာဒိ continuous (1–371)
    tika_an_01: "အံ၊ ပတွဲ", tika_an_02: "အံ၊ ဒုတွဲ",
    tika_an_03: "အံ၊ တတွဲ", tika_an_04: "အံ၊ တတွဲ",
    // ---- Ṭīkā: Majjhima — 3 vols; မဇ္ဈိမ+ဥပရိပဏ္ဏာသ continuous (1–442)
    tika_ma_01: "မ၊ ပတွဲ", tika_ma_02: "မ၊ ဒုတွဲ",
    tika_ma_03: "မ၊ တတွဲ", tika_ma_04: "မ၊ တတွဲ",
    // ---- Ṭīkā: Saṃyutta — 2 vols; နိဒါန–မဟာ continuous (1–551) → one vol
    tika_sa_01: "သံ၊ ပတွဲ",
    tika_sa_02: "သံ၊ ဒုတွဲ", tika_sa_03: "သံ၊ ဒုတွဲ",
    tika_sa_04: "သံ၊ ဒုတွဲ", tika_sa_05: "သံ၊ ဒုတွဲ",
    "05_anguttara_01": "အံ၊ ပတွဲ", "05_anguttara_02": "အံ၊ ဒုတွဲ",
    "05_anguttara_03": "အံ၊ တတွဲ", "05_anguttara_04": "အံ၊ စတွဲ",
    "05_anguttara_05": "အံ၊ ပဉ္စမတွဲ", "05_anguttara_06": "အံ၊ ဆဋ္ဌမတွဲ",
    "05_anguttara_07": "အံ၊ သတ္တမတွဲ", "05_anguttara_08": "အံ၊ အဋ္ဌမတွဲ",
    "05_anguttara_09": "အံ၊ နဝမတွဲ", "05_anguttara_10": "အံ၊ ဒသမတွဲ",
    "05_anguttara_11": "အံ၊ ဧကာဒသမတွဲ",
    "04_sanyutta_01": "သံ၊ ပတွဲ", "04_sanyutta_02": "သံ၊ ဒုတွဲ",
    "04_sanyutta_03": "သံ၊ တတွဲ", "04_sanyutta_04": "သံ၊ စတွဲ",
    "04_sanyutta_05": "သံ၊ ပဉ္စမတွဲ",
    "02_digha_01": "ဒီ၊ ပတွဲ", "02_digha_02": "ဒီ၊ ဒုတွဲ",
    "02_digha_03": "ဒီ၊ တတွဲ",
    "03_majjhima_01": "မ၊ ပတွဲ", "03_majjhima_02": "မ၊ ဒုတွဲ",
    "03_majjhima_03": "မ၊ တတွဲ",
    "06_khuddaka_08": "ထေရဂါထာတွဲ", "06_khuddaka_09": "ထေရဂါထာတွဲ",
};
function getVolumeLabel(bookId) { return VOLUME_LABELS[bookId] || ""; }
// Display helper: "စတုက္ကနိပါတပါဠိ (အံ၊ ပတွဲ)". Pure name when no label.
function withVolumeLabel(bookId, name) {
    const v = getVolumeLabel(bookId);
    return v ? name + " (" + v + ")" : name;
}
// Badge HTML for book lists. Empty string when no label.
function volumeBadgeHtml(bookId) {
    const v = getVolumeLabel(bookId);
    return v ? ` <span class="book-volume-badge">${v}</span>` : "";
}

// DOM Elements
const el = {
    appSidebar: document.getElementById("appSidebar"),
    dictSidebar: document.getElementById("dictSidebar"),
    btnToggleSidebar: document.getElementById("btnToggleSidebar"),
    btnToggleDict: document.getElementById("btnToggleDict"),
    btnToggleFullscreen: document.getElementById("btnToggleFullscreen"),
    btnToggleFullscreenMobile: document.getElementById("btnToggleFullscreenMobile"),
    btnExitFocusMode: document.getElementById("btnExitFocusMode"),
    fullscreenIcon: document.getElementById("fullscreenIcon"),
    fullscreenMobileLabel: document.getElementById("fullscreenMobileLabel"),
    btnCloseDict: document.getElementById("btnCloseDict"),
    
    // Mode Switcher & Tools
    btnModePali: document.getElementById("btnModePali"),
    btnModeMM: document.getElementById("btnModeMM"),
    btnModeNissaya: document.getElementById("btnModeNissaya"),
    btnModeSplit: document.getElementById("btnModeSplit"),
    btnCrossLink: document.getElementById("btnCrossLink"),
    crossLinkIcon: document.getElementById("crossLinkIcon"),
    crossLinkLabel: document.getElementById("crossLinkLabel"),
    btnCrossLinkNissaya: document.getElementById("btnCrossLinkNissaya"),
    btnViewOriginalImage: document.getElementById("btnViewOriginalImage"),
    btnToggleNotes: document.getElementById("btnToggleNotes"),
    toggleNotesLabel: document.getElementById("toggleNotesLabel"),
    btnToggleNotesMobile: document.getElementById("btnToggleNotesMobile"),
    toggleNotesLabelMobile: document.getElementById("toggleNotesLabelMobile"),
    mobileNotesRow: document.getElementById("mobileNotesRow"),
    btnToggleNissaya: document.getElementById("btnToggleNissaya"),
    toggleNissayaLabel: document.getElementById("toggleNissayaLabel"),
    scrollModeDropdownWrapper: document.getElementById("scrollModeDropdownWrapper"),
    btnScrollMode: document.getElementById("btnScrollMode"),
    scrollModeIcon: document.getElementById("scrollModeIcon"),
    scrollModeText: document.getElementById("scrollModeText"),
    pageScrollIndicator: document.getElementById("pageScrollIndicator"),
    pageScrollIndicatorText: document.getElementById("pageScrollIndicatorText"),
    scrollPageToast: document.getElementById("scrollPageToast"),
    scrollPageToastText: document.getElementById("scrollPageToastText"),
    loadPrevBox: document.getElementById("loadPrevBox"),
    btnLoadPrevPage: document.getElementById("btnLoadPrevPage"),
    loadPrevText: document.getElementById("loadPrevText"),
    infiniteSentinel: document.getElementById("infiniteSentinel"),
    sentinelLoading: document.getElementById("sentinelLoading"),
    sentinelEnd: document.getElementById("sentinelEnd"),
    metaEditionTag: document.getElementById("metaEditionTag"),
    paliBasketFilter: document.getElementById("paliBasketFilter"),

    // Header displays
    currentBookBadge: document.getElementById("currentBookBadge"),
    bookTitleDisplay: document.getElementById("bookTitleDisplay"),
    chapterTitleDisplay: document.getElementById("chapterTitleDisplay"),
    mobileBreadcrumbWrapper: document.getElementById("mobileBreadcrumbWrapper"),
    mobileChapterBreadcrumb: document.getElementById("mobileChapterBreadcrumb"),
    mobileBreadcrumbBook: document.getElementById("mobileBreadcrumbBook"),
    mobileBreadcrumbChapter: document.getElementById("mobileBreadcrumbChapter"),
    mobileBreadcrumbPage: document.getElementById("mobileBreadcrumbPage"),
    pageNumberInput: document.getElementById("pageNumberInput"),
    totalPageDisplay: document.getElementById("totalPageDisplay"),
    btnPrevPage: document.getElementById("btnPrevPage"),
    btnNextPage: document.getElementById("btnNextPage"),
    
    // Commentary dropdown
    relatedDropdownWrapper: document.getElementById("relatedDropdownWrapper"),
    btnRelated: document.getElementById("btnRelated"),
    relatedList: document.getElementById("relatedList"),

    // Unified Edition Switcher hub ("ကျမ်းရွေး") — desktop header entry
    btnOpenEdition: document.getElementById("btnOpenEdition"),
    
    // Bookmark
    btnBookmarkToggle: document.getElementById("btnBookmarkToggle"),
    bookmarkIcon: document.getElementById("bookmarkIcon"),
    
    // Font & Theme
    btnFontDec: document.getElementById("btnFontDec"),
    btnFontInc: document.getElementById("btnFontInc"),
    fontSizeDisplay: document.getElementById("fontSizeDisplay"),
    themeBtns: document.querySelectorAll(".theme-btn"),
    
    // Single Reading View
    readerContainer: document.getElementById("readerContainer"),
    readerPaper: document.getElementById("readerPaper"),
    paliContent: document.getElementById("paliContent"),
    metaBookName: document.getElementById("metaBookName"),
    metaPageNum: document.getElementById("metaPageNum"),
    btnFooterPrev: document.getElementById("btnFooterPrev"),
    btnFooterNext: document.getElementById("btnFooterNext"),
    footerCurrentPage: document.getElementById("footerCurrentPage"),
    footerTotalPage: document.getElementById("footerTotalPage"),
    btnOpenJumpSheet: document.getElementById("btnOpenJumpSheet"),
    jumpInlineRow: document.getElementById("jumpInlineRow"),
    jumpInlineInput: document.getElementById("jumpInlineInput"),
    btnJumpInlineGo: document.getElementById("btnJumpInlineGo"),
    btnJumpInlineClose: document.getElementById("btnJumpInlineClose"),
    
    // Split View (Left: Current Pali / Right: Dynamic Companion)
    splitViewContainer: document.getElementById("splitViewContainer"),
    splitPaliTitle: document.getElementById("splitPaliTitle"),
    splitPaliContent: document.getElementById("splitPaliContent"),
    btnSplitPaliPrev: document.getElementById("btnSplitPaliPrev"),
    btnSplitPaliNext: document.getElementById("btnSplitPaliNext"),
    splitPaliPageInput: document.getElementById("splitPaliPageInput"),
    splitPaliTotalDisplay: document.getElementById("splitPaliTotalDisplay"),

    // Dynamic Companion Elements (Right Pane)
    companionTabsBar: document.getElementById("companionTabsBar"),
    compVolumeBox: document.getElementById("compVolumeBox"),
    compVolumeSelect: document.getElementById("compVolumeSelect"),
    splitRightPane: document.getElementById("splitRightPane"),
    splitRightContent: document.getElementById("splitRightContent") || document.getElementById("splitMMContent"),
    btnSplitRightPrev: document.getElementById("btnSplitRightPrev") || document.getElementById("btnSplitMMPrev"),
    btnSplitRightNext: document.getElementById("btnSplitRightNext") || document.getElementById("btnSplitMMNext"),
    splitRightPageInput: document.getElementById("splitRightPageInput") || document.getElementById("splitMMPageInput"),
    splitRightTotalDisplay: document.getElementById("splitRightTotalDisplay") || document.getElementById("splitMMTotalDisplay"),
    btnOpenCompanionMobile: document.getElementById("btnOpenCompanionMobile"),

    // Aliases for backwards compatibility
    splitMMTitle: document.getElementById("splitMMTitle"),
    splitMMContent: document.getElementById("splitRightContent") || document.getElementById("splitMMContent"),
    btnSplitMMPrev: document.getElementById("btnSplitRightPrev") || document.getElementById("btnSplitMMPrev"),
    btnSplitMMNext: document.getElementById("btnSplitRightNext") || document.getElementById("btnSplitMMNext"),
    splitMMPageInput: document.getElementById("splitRightPageInput") || document.getElementById("splitMMPageInput"),
    splitMMTotalDisplay: document.getElementById("splitRightTotalDisplay") || document.getElementById("splitMMTotalDisplay"),
    btnSplitSync: document.getElementById("btnSplitSync"),

    // Sidebar Tabs
    sidebarTabBtns: document.querySelectorAll(".sidebar-tabs .tab-btn"),
    sidebarPanels: document.querySelectorAll(".sidebar-tab-panel"),
    basketBtns: document.querySelectorAll(".basket-btn"),
    booksFilterInput: document.getElementById("booksFilterInput"),
    booksTreeList: document.getElementById("booksTreeList"),
    tocFilterInput: document.getElementById("tocFilterInput"),
    btnTocExpandAll: document.getElementById("btnTocExpandAll"),
    btnTocCollapseAll: document.getElementById("btnTocCollapseAll"),
    tocList: document.getElementById("tocList"),
    tocCurrentCard: document.getElementById("tocCurrentCard"),
    tocCurrentPagePill: document.getElementById("tocCurrentPagePill"),
    tocCurrentTitle: document.getElementById("tocCurrentTitle"),
    tocCurrentRange: document.getElementById("tocCurrentRange"),
    suttaFilterInput: document.getElementById("suttaFilterInput"),
    suttaList: document.getElementById("suttaList"),
    bookmarksList: document.getElementById("bookmarksList"),
    
    // Dictionary
    dictSearchInput: document.getElementById("dictSearchInput"),
    btnDictSearch: document.getElementById("btnDictSearch"),
    dictContent: document.getElementById("dictContent"),
    
    // Search Modal
    searchModal: document.getElementById("searchModal"),
    btnOpenSearch: document.getElementById("btnOpenSearch"),
    btnCloseModal: document.getElementById("btnCloseModal"),
    globalSearchInput: document.getElementById("globalSearchInput"),
    btnClearSearch: document.getElementById("btnClearSearch"),
    scopeBtnPali: document.getElementById("scopeBtnPali"),
    scopeBtnMM: document.getElementById("scopeBtnMM"),
    bookScopeBar: document.getElementById("bookScopeBar"),
    bookScopeAllBtn: document.getElementById("bookScopeAllBtn"),
    bookScopeCurrentBtn: document.getElementById("bookScopeCurrentBtn"),
    currentBookName: document.getElementById("currentBookName"),
    paliTabsGroup: document.getElementById("paliTabsGroup"),
    mmTabsGroup: document.getElementById("mmTabsGroup"),
    modalTabBtns: document.querySelectorAll(".modal-tab-btn"),
    searchSummary: document.getElementById("searchSummary"),
    searchResultsList: document.getElementById("searchResultsList"),
    
    // Help / User Guide Modal
    helpModal: document.getElementById("helpModal"),
    btnOpenHelp: document.getElementById("btnOpenHelp"),
    btnCloseHelp: document.getElementById("btnCloseHelp"),

    // Quick Popover
    dictQuickPopover: document.getElementById("dictQuickPopover"),
    popoverWord: document.getElementById("popoverWord"),
    popoverBody: document.getElementById("popoverBody"),
    btnClosePopover: document.getElementById("btnClosePopover"),
    btnOpenInFullDict: document.getElementById("btnOpenInFullDict"),

    // Home Catalog & Bottom Nav (APK Style)
    btnGoHome: document.getElementById("btnGoHome"),
    homePage: document.getElementById("homePage"),
    homeAppTitle: document.getElementById("homeAppTitle"),
    homeBtnModeToggle: document.getElementById("homeBtnModeToggle"),
    homeModeToggleLabel: document.getElementById("homeModeToggleLabel"),
    homeBtnSearch: document.getElementById("homeBtnSearch"),
    homeBasketTabs: document.getElementById("homeBasketTabs"),
    homeCatalogInner: document.getElementById("homeCatalogInner"),
    btnFloatingSutta: document.getElementById("btnFloatingSutta"),
    bottomNavBar: document.getElementById("bottomNavBar"),
    bottomNav: document.getElementById("bottomNavBar"),
    btnNavHome: document.getElementById("btnNavHome"),
    btnNavReader: document.getElementById("btnNavReader"),
    btnNavRecent: document.getElementById("btnNavRecent"),
    btnNavSearch: document.getElementById("btnNavSearch"),
    btnNavDict: document.getElementById("btnNavDict"),
    btnNavMore: document.getElementById("btnNavMore"),

    // History Modal & Insights / Backup
    historyModal: document.getElementById("historyModal"),
    btnOpenHistory: document.getElementById("btnOpenHistory"),
    btnOpenHistoryMobile: document.getElementById("btnOpenHistoryMobile"),
    btnCloseHistory: document.getElementById("btnCloseHistory"),
    btnClearAllHistory: document.getElementById("btnClearAllHistory"),
    btnBackupHistory: document.getElementById("btnBackupHistory"),
    btnRestoreHistory: document.getElementById("btnRestoreHistory"),
    restoreFileInput: document.getElementById("restoreFileInput"),
    historySearchWrapper: document.getElementById("historySearchWrapper"),
    historyFilterInput: document.getElementById("historyFilterInput"),
    btnClearHistoryFilter: document.getElementById("btnClearHistoryFilter"),
    tabHistoryReading: document.getElementById("tabHistoryReading"),
    tabHistorySearch: document.getElementById("tabHistorySearch"),
    tabHistoryInsights: document.getElementById("tabHistoryInsights"),
    historyReadingBadge: document.getElementById("historyReadingBadge"),
    historySearchBadge: document.getElementById("historySearchBadge"),
    historyFilterPills: document.getElementById("historyFilterPills"),
    historyItemsContainer: document.getElementById("historyItemsContainer"),

    // Mobile Reader Header & Toolbar (Option A)
    mobileBreadcrumbWrapper: document.getElementById("mobileBreadcrumbWrapper"),
    btnMobileBackHome: document.getElementById("btnMobileBackHome"),
    btnMobileHeaderSearch: document.getElementById("btnMobileHeaderSearch"),
    btnMobileHeaderTOC: document.getElementById("btnMobileHeaderTOC"),
    btnMobilePageBadge: document.getElementById("btnMobilePageBadge"),

    // Mobile Dedicated Reader Toolbar (5 Items)
    mobileReaderToolbar: document.getElementById("mobileReaderToolbar"),
    btnReaderEdition: document.getElementById("btnReaderEdition"),
    toolbarEditionIcon: document.getElementById("toolbarEditionIcon"),
    toolbarEditionLabel: document.getElementById("toolbarEditionLabel"),
    btnReaderSearch: document.getElementById("btnReaderSearch"),
    btnReaderDict: document.getElementById("btnReaderDict"),
    btnReaderBookmark: document.getElementById("btnReaderBookmark"),
    toolbarBookmarkIcon: document.getElementById("toolbarBookmarkIcon"),
    toolbarBookmarkLabel: document.getElementById("toolbarBookmarkLabel"),
    btnReaderMore: document.getElementById("btnReaderMore"),

    // Unified Edition Switcher Modal ("ကျမ်းရွေး")
    editionSwitcherBackdrop: document.getElementById("editionSwitcherBackdrop"),
    editionSwitcherSheet: document.getElementById("editionSwitcherSheet"),
    btnCloseEditionSwitcher: document.getElementById("btnCloseEditionSwitcher"),
    editionSwitcherSubtitle: document.getElementById("editionSwitcherSubtitle"),
    editionSwitcherList: document.getElementById("editionSwitcherList"),

    // Reader More Sheet Modal ("အခြား")
    readerMoreBackdrop: document.getElementById("readerMoreBackdrop"),
    readerMoreSheet: document.getElementById("readerMoreSheet"),
    btnCloseReaderMore: document.getElementById("btnCloseReaderMore"),
    btnMoreFontDec: document.getElementById("btnMoreFontDec"),
    btnMoreFontInc: document.getElementById("btnMoreFontInc"),
    moreFontDisplay: document.getElementById("moreFontDisplay"),
    btnMoreToggleNotes: document.getElementById("btnMoreToggleNotes"),
    moreNotesStateText: document.getElementById("moreNotesStateText"),
    btnMoreToggleNissaya: document.getElementById("btnMoreToggleNissaya"),
    moreNissayaStateText: document.getElementById("moreNissayaStateText"),
    nissayaToggleRow: document.getElementById("nissayaToggleRow"),
    btnMoreDictSheet: document.getElementById("btnMoreDictSheet"),
    btnMoreCopy: document.getElementById("btnMoreCopy"),
    btnMoreTOC: document.getElementById("btnMoreTOC"),
    btnMoreHome: document.getElementById("btnMoreHome")
};


// ============================================================
// Paragraph Annotation System (📌 Highlight + Note)
// ============================================================

const AnnotationManager = {
    KEY: "tipitaka_annotations_v1",

    _readRaw() {
        try {
            const raw = localStorage.getItem(this.KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    },

    save(list) {
        try {
            localStorage.setItem(this.KEY, JSON.stringify(list));
        } catch (e) { console.error("Annotation save failed:", e); }
    },

    // Visible annotations (excludes tombstones)
    getAll() {
        return this._readRaw().filter(a => !a.deleted);
    },

    getAllIncludingDeleted() {
        return this._readRaw();
    },

    get(id) {
        return this._readRaw().find(a => a.id === id) || null;
    },

    add(entry) {
        // entry: { bookId, bookName, page, paraId, paraText, selText, selStart, color, note }
        const list = this._readRaw();
        const now = Date.now();
        // Guard against accidental double-save of the exact same selection
        const dup = list.find(a => !a.deleted && a.bookId === entry.bookId && a.page === entry.page
            && a.paraId === entry.paraId && (a.selText || "") === (entry.selText || "")
            && (a.note || "") === (entry.note || ""));
        if (dup) return dup;
        const item = {
            bookId: entry.bookId, bookName: entry.bookName, page: entry.page, paraId: entry.paraId,
            paraText: entry.paraText || "", selText: entry.selText || "", selStart: entry.selStart || 0,
            color: entry.color || "amber", note: entry.note || "",
            id: "ann_" + now.toString(36) + "_" + Math.random().toString(36).slice(2, 8),
            updatedAt: now, deleted: 0
        };
        list.unshift(item);
        this.save(list);
        return item;
    },

    update(id, patch) {
        const list = this._readRaw();
        const it = list.find(a => a.id === id);
        if (!it) return null;
        if (patch.color) it.color = patch.color;
        if (patch.note !== undefined) it.note = String(patch.note).substring(0, 500);
        it.updatedAt = Date.now();
        this.save(list);
        return it;
    },

    // Tombstone delete (sync-friendly: deletions propagate to other devices)
    remove(id) {
        const list = this._readRaw();
        const it = list.find(a => a.id === id);
        if (it) {
            it.deleted = 1;
            it.updatedAt = Date.now();
            this.save(list);
        }
    },

    removeByPara(bookId, page, paraId) {
        const list = this._readRaw();
        let changed = false;
        list.forEach(a => {
            if (!a.deleted && a.bookId === bookId && a.page === page && a.paraId === paraId) {
                a.deleted = 1; a.updatedAt = Date.now(); changed = true;
            }
        });
        if (changed) this.save(list);
    },

    clearAll() {
        const list = this._readRaw();
        const now = Date.now();
        list.forEach(a => { a.deleted = 1; a.updatedAt = now; });
        this.save(list);
    },

    getForPara(bookId, page, paraId) {
        return this.getAll().find(a => a.bookId === bookId && a.page === page && a.paraId === paraId) || null;
    },

    // Merge remote annotations, last-write-wins per id. Returns true if local data changed.
    mergeRemote(remoteList) {
        if (!Array.isArray(remoteList) || remoteList.length === 0) return false;
        const list = this._readRaw();
        const byId = new Map(list.map(a => [a.id, a]));
        let changed = false;
        for (const r of remoteList) {
            if (!r || typeof r.id !== "string" || !r.id) continue;
            const rUpd = Number(r.updatedAt) || 0;
            const local = byId.get(r.id);
            if (!local) {
                byId.set(r.id, { ...r, updatedAt: rUpd });
                changed = true;
            } else if (rUpd > (Number(local.updatedAt) || 0)) {
                byId.set(r.id, { ...local, ...r, updatedAt: rUpd });
                changed = true;
            }
        }
        if (changed) {
            // Prune ancient tombstones locally (server prunes them too)
            const now = Date.now(), PRUNE_MS = 90 * 24 * 3600 * 1000;
            const merged = [...byId.values()].filter(a =>
                !(a.deleted && (now - (Number(a.updatedAt) || 0)) > PRUNE_MS));
            this.save(merged);
        }
        return changed;
    },

    // Annotations (incl. tombstones) changed since ts — the push payload
    changedSince(ts) {
        return this._readRaw().filter(a => (Number(a.updatedAt) || 0) > (ts || 0));
    }
};

// Annotation popup state
let _annPopupTarget = null; // { el, bookId, page, paraId, paraText } or { editId }
let _annSelectedColor = "amber";
let _annLastColor = "amber"; // last used color, for quick-highlight

function closeAnnotationPopup() {
    const popup = document.getElementById("annotationPopup");
    if (popup) popup.style.display = "none";
    _annPopupTarget = null;
}

// Remove an inline highlight span but keep its text
function unwrapAnnotationSpan(annId) {
    const span = document.querySelector(`span.ann-sel[data-ann-id="${CSS.escape(annId)}"]`);
    if (!span || !span.parentNode) return;
    const parent = span.parentNode;
    while (span.firstChild) parent.insertBefore(span.firstChild, span);
    parent.removeChild(span);
    if (parent.normalize) parent.normalize();
}

function saveAnnotation() {
    if (!_annPopupTarget) return;
    const t = _annPopupTarget;
    const note = (document.getElementById("annotationNoteInput")?.value || "").trim().substring(0, 500);
    const color = _annSelectedColor;
    _annLastColor = color;

    if (t.editId) {
        // Edit an existing annotation (opened by tapping its highlight)
        const updated = AnnotationManager.update(t.editId, { color, note });
        const span = document.querySelector(`span.ann-sel[data-ann-id="${CSS.escape(t.editId)}"]`);
        if (span) {
            span.classList.remove("ann-sel-amber", "ann-sel-blue", "ann-sel-green", "ann-sel-red");
            span.classList.add(`ann-sel-${color}`);
        }
        if (updated && !updated.selText) {
            const p = document.querySelector(`p.annotatable-para[data-para-id="${CSS.escape(updated.paraId)}"]`);
            if (p) applyAnnotationStyleToPara(p, color);
        }
    } else {
        const entry = {
            bookId: t.bookId,
            bookName: state.paliBookName || state.mmBookName || t.bookId,
            page: t.page,
            paraId: t.paraId,
            paraText: (t.paraText || "").substring(0, 120),
            color,
            note
        };
        if (t.isSelection && t.range) {
            entry.selText = (t.selText || "").substring(0, 500);
            entry.selStart = t.selStart || 0;
            const item = AnnotationManager.add(entry);
            const span = wrapRangeWithHighlight(t.range, color);
            if (span && item) span.setAttribute("data-ann-id", item.id);
        } else {
            // Legacy paragraph-level annotation
            AnnotationManager.add(entry);
            if (t.el) applyAnnotationStyleToPara(t.el, color);
        }
    }

    try { window.getSelection().removeAllRanges(); } catch (e) {}
    closeAnnotationPopup();
    hideSelectionToolbar();
    renderAnnotationSidebar();
    applyAnnotationsToCurrentPage();
    SyncManager.schedulePush();
}

function deleteAnnotationFromPopup() {
    if (!_annPopupTarget || !_annPopupTarget.editId) return;
    const id = _annPopupTarget.editId;
    AnnotationManager.remove(id);
    unwrapAnnotationSpan(id);
    closeAnnotationPopup();
    renderAnnotationSidebar();
    applyAnnotationsToCurrentPage();
    SyncManager.schedulePush();
}

function applyAnnotationStyleToPara(paraEl, color) {
    paraEl.classList.remove("ann-amber", "ann-blue", "ann-green", "ann-red");
    paraEl.classList.add("has-annotation", `ann-${color}`);
}

function removeAnnotationStyleFromPara(paraEl) {
    paraEl.classList.remove("has-annotation", "ann-amber", "ann-blue", "ann-green", "ann-red");
}

// Prepare paragraphs for text-selection annotation (no pin buttons):
// assign stable para ids + re-apply saved highlights (legacy paragraph
// highlights and text-selection highlights).
function injectAnnotationPins(containerEl, bookId, page) {
    if (!containerEl) return;
    try {
        // Remove any legacy pin buttons left from older versions
        containerEl.querySelectorAll(".para-pin-btn").forEach(b => b.remove());

        const paras = containerEl.querySelectorAll("p");
        // Hoist the annotation read out of the per-paragraph loop: getAll() does a
        // localStorage read + full JSON.parse, and this loop runs per paragraph
        // (50-150x per page). Index once by paraId instead of O(P x A) filtering.
        const byPara = new Map();
        for (const a of AnnotationManager.getAll()) {
            if (a && a.bookId === bookId && String(a.page) === String(page) && a.paraId) {
                if (!byPara.has(a.paraId)) byPara.set(a.paraId, []);
                byPara.get(a.paraId).push(a);
            }
        }
        paras.forEach((p, idx) => {
            if (!p.classList.contains("annotatable-para") || !p.getAttribute("data-para-id")) {
                p.classList.add("annotatable-para");
                p.setAttribute("data-para-id", `p${page}_${idx}`);
            }
            // Remember reading context on the paragraph for selection handler
            p.setAttribute("data-ann-book", bookId);
            p.setAttribute("data-ann-page", page);

            // Re-apply saved annotations for this paragraph
            const paraId = p.getAttribute("data-para-id");
            const entries = byPara.get(paraId) || [];
            entries.forEach(a => {
                if (!a) return;
                try {
                    if (a.selText) {
                        highlightTextInPara(p, a.selText, a.color, a.selStart || 0, a.id);
                    } else {
                        applyAnnotationStyleToPara(p, a.color);
                    }
                } catch (e) {
                    console.warn("highlightText err:", e);
                }
            });
        });
    } catch (err) {
        console.warn("injectAnnotationPins error:", err);
    }
}

// Find the annotatable paragraph containing a DOM node
function getParaOf(node) {
    if (!node) return null;
    const el = node.nodeType === 1 ? node : node.parentElement;
    return el ? el.closest("p.annotatable-para") : null;
}

// Character offset of a range's start inside its paragraph (for re-highlight anchoring)
function getSelectionOffsetInPara(range, paraEl) {
    try {
        const pre = range.cloneRange();
        pre.selectNodeContents(paraEl);
        pre.setEnd(range.startContainer, range.startOffset);
        return pre.toString().length;
    } catch (e) { return 0; }
}

// Wrap a Range with a colored inline highlight span (selection annotation)
function wrapRangeWithHighlight(range, color) {
    if (!range || range.collapsed) return null;
    const span = document.createElement("span");
    span.className = `ann-sel ann-sel-${color || "amber"}`;
    try {
        range.surroundContents(span);
    } catch (e) {
        try {
            const frag = range.extractContents();
            span.appendChild(frag);
            range.insertNode(span);
        } catch (e2) {
            return null;
        }
    }
    return span;
}

// Re-highlight saved selected text inside a paragraph (multi text-node aware)
function highlightTextInPara(paraEl, text, color, fromIndex, annId) {
    if (!paraEl || !text) return false;
    const walker = document.createTreeWalker(paraEl, NodeFilter.SHOW_TEXT);
    const map = []; // char index -> {node, offset}
    let full = "";
    while (walker.nextNode()) {
        const n = walker.currentNode;
        if (n.parentElement && n.parentElement.closest(".ann-sel")) continue; // skip already highlighted
        const v = n.nodeValue;
        for (let i = 0; i < v.length; i++) map.push({ node: n, offset: i });
        full += v;
    }
    let idx = full.indexOf(text, fromIndex || 0);
    if (idx === -1 && (fromIndex || 0) > 0) idx = full.indexOf(text); // fallback: search from start
    if (idx === -1 || !map[idx] || !map[idx + text.length - 1]) return false;
    const s = map[idx], e = map[idx + text.length - 1];
    const range = document.createRange();
    try {
        range.setStart(s.node, s.offset);
        range.setEnd(e.node, e.offset + 1);
    } catch (err) { return false; }
    const span = wrapRangeWithHighlight(range, color);
    if (span && annId) span.setAttribute("data-ann-id", annId);
    return !!span;
}

// Open the annotation popup for a text selection
function openSelectionPopup(paraEl, bookId, page, paraId, selText, range) {
    const popup = document.getElementById("annotationPopup");
    if (!popup) return;

    const selStart = getSelectionOffsetInPara(range, paraEl);
    _annPopupTarget = {
        el: paraEl, bookId, page, paraId,
        paraText: selText, selText, selStart,
        range: range.cloneRange(), isSelection: true
    };
    _annSelectedColor = "amber";

    const noteInput = document.getElementById("annotationNoteInput");
    const deleteBtn = document.getElementById("btnDeleteAnnotation");
    if (noteInput) noteInput.value = "";
    if (deleteBtn) deleteBtn.style.display = "none";
    popup.querySelectorAll(".ann-color-btn").forEach(btn => {
        btn.classList.toggle("selected", btn.getAttribute("data-color") === "amber");
    });

    const title = popup.querySelector(".ann-popup-title");
    if (title) title.textContent = "📌 မှတ်ချက် ထည့်ရန်";

    // Position popup near the selection (popup is position:fixed → viewport coords)
    let rect = null;
    try { rect = range.getBoundingClientRect(); } catch (e) { /* ignore */ }
    positionAnnotationPopup(rect);
    popup.style.display = "block";
}

// Stash the selection synchronously on mouseup/touchend (other handlers may
// clear the live selection right after), then open the popup from the stash.
let _pendingSelection = null;
function stashSelection() {
    _pendingSelection = null;
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const rawRange = sel.getRangeAt(0);
    const paraEl = getParaOf(rawRange.startContainer) || getParaOf(rawRange.endContainer);
    if (!paraEl) return;
    const range = rawRange.cloneRange();
    try {
        if (getParaOf(range.endContainer) !== paraEl) range.setEnd(paraEl, paraEl.childNodes.length);
        if (getParaOf(range.startContainer) !== paraEl) range.setStart(paraEl, 0);
    } catch (e) { return; }
    const selectedText = range.toString().trim();
    if (selectedText.length < 2) return;
    const bookId = paraEl.getAttribute("data-ann-book");
    const page = parseInt(paraEl.getAttribute("data-ann-page"), 10);
    const paraId = paraEl.getAttribute("data-para-id");
    if (!bookId || isNaN(page) || !paraId) return;
    _pendingSelection = { paraEl, bookId, page, paraId, selectedText, range };
}

function setupSelectionAnnotation() {
    const isUiTarget = (e) => e.target.closest &&
        e.target.closest("#annotationPopup, #annSelectToolbar, #syncModal, #exportModal");
    // Mouse: stash on mouseup, show mini toolbar shortly after
    document.addEventListener("mouseup", (e) => {
        if (isUiTarget(e)) return; // interacting with popup/toolbar/modal
        stashSelection();
        setTimeout(() => {
            if (_pendingSelection) {
                const p = _pendingSelection;
                _pendingSelection = null;
                showSelectionToolbar(p);
            }
        }, 80);
    });
    // Touch: same idea, slightly longer delay so mobile selection handles settle
    document.addEventListener("touchend", (e) => {
        if (isUiTarget(e)) return;
        stashSelection();
        setTimeout(() => {
            if (_pendingSelection) {
                const p = _pendingSelection;
                _pendingSelection = null;
                showSelectionToolbar(p);
            }
        }, 200);
    }, { passive: true });
    // Hide the toolbar when the page scrolls or the selection is cleared.
    // Ignore scrolls right after the toolbar appears: on touch devices the
    // browser often fires a small adjusting scroll just as the toolbar shows,
    // which would otherwise dismiss it instantly.
    document.addEventListener("scroll", () => {
        if (_selToolbar && Date.now() - _selToolbarShownAt < 800) return;
        hideSelectionToolbar();
    }, { passive: true, capture: true });
}

// --- Mini floating toolbar on text selection (Medium-style) ---
let _selToolbar = null;
let _selToolbarShownAt = 0;

function showSelectionToolbar(info) {
    hideSelectionToolbar();
    let rect = null;
    try { rect = info.range.getBoundingClientRect(); } catch (e) { /* ignore */ }
    const bar = document.createElement("div");
    bar.id = "annSelectToolbar";
    bar.className = "ann-select-toolbar";
    bar.innerHTML =
        `<button class="ann-tb-btn" data-act="quick" title="အရောင်မှတ် (note မပါ)">🖍️</button>` +
        `<button class="ann-tb-btn" data-act="note" title="မှတ်ချက် + အရောင်">📝</button>` +
        `<button class="ann-tb-btn" data-act="copy" title="စာသား ကူးယူရန်">📋</button>`;
    document.body.appendChild(bar);

    const bw = 156, bh = 44;
    let left = rect ? rect.left + rect.width / 2 - bw / 2 : window.innerWidth / 2 - bw / 2;
    let top = rect ? rect.top - bh - 10 : 120;
    left = Math.max(8, Math.min(window.innerWidth - bw - 8, left));
    if (top < 8) top = (rect ? rect.bottom : 120) + 10;
    bar.style.left = `${left}px`;
    bar.style.top = `${top}px`;
    _selToolbar = bar;
    _selToolbarShownAt = Date.now();

    bar.querySelector('[data-act="quick"]').addEventListener("click", (e) => {
        e.stopPropagation();
        quickSaveAnnotation(info);
    });
    bar.querySelector('[data-act="note"]').addEventListener("click", (e) => {
        e.stopPropagation();
        hideSelectionToolbar();
        openSelectionPopup(info.paraEl, info.bookId, info.page, info.paraId, info.selectedText, info.range);
    });
    bar.querySelector('[data-act="copy"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const text = info.selectedText || "";
        let done = false;
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                done = true;
            }
        } catch (err) {}
        if (!done) {
            try {
                const ta = document.createElement("textarea");
                ta.value = text;
                ta.style.position = "fixed";
                ta.style.opacity = "0";
                document.body.appendChild(ta);
                ta.select();
                done = document.execCommand("copy");
                ta.remove();
            } catch (err) {}
        }
        btn.textContent = done ? "✅" : "❌";
        setTimeout(() => {
            try { window.getSelection().removeAllRanges(); } catch (err) {}
            hideSelectionToolbar();
        }, done ? 450 : 900);
    });
}

function hideSelectionToolbar() {
    if (_selToolbar) { _selToolbar.remove(); _selToolbar = null; }
}

// One-tap highlight with the last used color (no popup)
function quickSaveAnnotation(info) {
    const color = _annLastColor || "amber";
    const selStart = getSelectionOffsetInPara(info.range, info.paraEl);
    const entry = {
        bookId: info.bookId,
        bookName: state.paliBookName || state.mmBookName || info.bookId,
        page: info.page,
        paraId: info.paraId,
        paraText: info.selectedText.substring(0, 120),
        selText: info.selectedText.substring(0, 500),
        selStart, color, note: ""
    };
    const item = AnnotationManager.add(entry);
    const span = wrapRangeWithHighlight(info.range, color);
    if (span && item) span.setAttribute("data-ann-id", item.id);
    try { window.getSelection().removeAllRanges(); } catch (e) {}
    hideSelectionToolbar();
    renderAnnotationSidebar();
    SyncManager.schedulePush();
}

// --- Edit existing annotation by tapping its highlight ---
function openEditPopup(ann, anchorEl) {
    const popup = document.getElementById("annotationPopup");
    if (!popup) return;
    _annPopupTarget = { editId: ann.id };
    _annSelectedColor = ann.color || "amber";

    const noteInput = document.getElementById("annotationNoteInput");
    const deleteBtn = document.getElementById("btnDeleteAnnotation");
    if (noteInput) noteInput.value = ann.note || "";
    if (deleteBtn) deleteBtn.style.display = "inline-flex";
    popup.querySelectorAll(".ann-color-btn").forEach(btn => {
        btn.classList.toggle("selected", btn.getAttribute("data-color") === _annSelectedColor);
    });
    const title = popup.querySelector(".ann-popup-title");
    if (title) title.textContent = "✏️ မှတ်ချက် ပြင်ရန်";

    let rect = null;
    try { rect = anchorEl.getBoundingClientRect(); } catch (e) { /* ignore */ }
    positionAnnotationPopup(rect);
    popup.style.display = "block";
}

function setupHighlightTapToEdit() {
    // Highlights only exist inside the reader. Keep this delegated listener
    // local: document-level closest() runs for every page-pill click and can
    // force Chromium to walk the whole feed DOM on low-end devices.
    if (!el.readerContainer) return;
    el.readerContainer.addEventListener("click", (e) => {
        const span = e.target instanceof Element
            ? e.target.closest("span.ann-sel[data-ann-id]")
            : null;
        if (!span) return;
        const ann = AnnotationManager.get(span.getAttribute("data-ann-id"));
        if (!ann || ann.deleted) return;
        try { window.getSelection().removeAllRanges(); } catch (err) {}
        hideSelectionToolbar();
        openEditPopup(ann, span);
    });
}

// Shared popup positioning (popup is position:fixed → viewport coords)
function positionAnnotationPopup(rect) {
    const popup = document.getElementById("annotationPopup");
    if (!popup) return;
    const popW = 280, popH = 230;
    let top = (rect ? rect.bottom : 200) + 8;
    let left = rect ? rect.left : 100;
    if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
    if (left < 8) left = 8;
    if (top + popH > window.innerHeight) top = Math.max(8, (rect ? rect.top : 200) - popH - 8);
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;
}

// Re-apply annotations after page content loads (called after loadPaliPage / loadMMPage)
function applyAnnotationsToCurrentPage() {
    const bookId = (state.readerMode === "mm") ? state.mmBookId : state.paliBookId;
    const page = (state.readerMode === "mm") ? state.mmPage : state.paliPage;

    // Main reader
    if (el.paliContent) injectAnnotationPins(el.paliContent, bookId, page);
    if (el.splitPaliContent) injectAnnotationPins(el.splitPaliContent, state.paliBookId, state.paliPage);
    // Myanmar Nissaya gloss layer (Pāḷi modes only; no-op when toggled off)
    applyNissayaToCurrentPage();
}

// Render sidebar annotation list
function renderAnnotationSidebar() {
    const listEl = document.getElementById("annotationList");
    if (!listEl) return;

    const all = AnnotationManager.getAll();
    if (all.length === 0) {
        listEl.innerHTML = `<div class="empty-state">✨ ဖတ်နေရင်း လိုချင်တဲ့ စာသားကို select လုပ်လိုက်ရင် မှတ်ချက် ထည့်တဲ့ 🖍️/📝 toolbar ပေါ်လာပါမယ်။</div>`;
        return;
    }

    const colorMap = { amber: "#f59e0b", blue: "#3b82f6", green: "#10b981", red: "#ef4444" };

    let html = "";
    all.forEach(a => {
        const col = colorMap[a.color] || colorMap.amber;
        const noteHtml = a.note ? `<div class="ann-item-note">${escapeHtml(a.note)}</div>` : "";
        const preview = a.selText || a.paraText || "";
        html += `
            <div class="annotation-item" data-id="${escapeHtml(a.id)}" data-book="${escapeHtml(a.bookId)}" data-page="${a.page}" data-para="${escapeHtml(a.paraId)}">
                <div class="ann-item-color" style="background:${col};"></div>
                <div class="ann-item-body">
                    <div class="ann-item-meta">${escapeHtml(a.bookName || a.bookId)} • စာ-${toMyanmarNum(a.page)}</div>
                    <div class="ann-item-preview">${escapeHtml(preview)}</div>
                    ${noteHtml}
                </div>
                <button class="ann-item-del" data-id="${escapeHtml(a.id)}" title="ဖျက်ရန်">✕</button>
            </div>
        `;
    });
    listEl.innerHTML = html;

    // Click annotation item → navigate to that page
    listEl.querySelectorAll(".annotation-item").forEach(item => {
        item.addEventListener("click", async (e) => {
            if (e.target.closest(".ann-item-del")) return;
            const annId = item.getAttribute("data-id");
            const bookId = item.getAttribute("data-book");
            const page = parseInt(item.getAttribute("data-page"), 10);
            if (!bookId || isNaN(page)) return;

            // Determine mode by bookId prefix
            const isMMBook = state.mmCategories && state.mmCategories.some(cat =>
                (cat.books || []).some(b => b.id === bookId)
            );
            if (isMMBook) {
                setReaderMode("mm");
                await loadMMBook(bookId, page);
            } else {
                setReaderMode("pali");
                await loadPaliBook(bookId, page);
            }
            setAppView("reader");
            // Close sidebar on mobile
            if (window.innerWidth <= 992) closeSidebarMobile();
            // Scroll to the annotation (exact highlight span if present) and flash it
            setTimeout(() => {
                let target = null;
                if (annId) {
                    target = document.querySelector(`span.ann-sel[data-ann-id="${CSS.escape(annId)}"]`);
                }
                if (!target) {
                    const paraId = item.getAttribute("data-para");
                    target = document.querySelector(`p.annotatable-para[data-para-id="${CSS.escape(paraId)}"]`);
                }
                if (target) {
                    target.scrollIntoView({ block: "center", behavior: "smooth" });
                    target.classList.add("ann-flash");
                    setTimeout(() => target.classList.remove("ann-flash"), 1800);
                }
            }, 400);
        });
    });

    // Delete individual annotation
    listEl.querySelectorAll(".ann-item-del").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const id = btn.getAttribute("data-id");
            AnnotationManager.remove(id);
            unwrapAnnotationSpan(id);
            renderAnnotationSidebar();
            // Also remove highlight from currently visible paragraphs
            applyAnnotationsToCurrentPage();
            SyncManager.schedulePush();
        });
    });
}

// ============================================================
// Cross-device annotation sync (pairing-code based)
// ============================================================
const SyncManager = {
    S_SECRET: "tipitaka_sync_secret",
    S_CODE: "tipitaka_sync_code",
    S_LAST: "tipitaka_sync_last",
    _pushTimer: null,

    get secret() { try { return localStorage.getItem(this.S_SECRET); } catch (e) { return null; } },
    get code() { try { return localStorage.getItem(this.S_CODE); } catch (e) { return null; } },
    get lastSync() { return parseInt(localStorage.getItem(this.S_LAST) || "0", 10) || 0; },
    set lastSync(v) { try { localStorage.setItem(this.S_LAST, String(v)); } catch (e) {} },
    isPaired() { return !!this.secret; },

    deviceName() {
        let n = null;
        try { n = localStorage.getItem("tipitaka_device_name"); } catch (e) {}
        if (!n) {
            const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent || "");
            n = (mobile ? "Phone" : "Computer") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
            try { localStorage.setItem("tipitaka_device_name", n); } catch (e) {}
        }
        return n;
    },

    async _post(path, body) {
        const res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {})
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || ("HTTP " + res.status));
        return data;
    },

    // Create a new sync account on this device; returns the pairing code
    async create() {
        const data = await this._post("/api/sync/create", { device_name: this.deviceName() });
        try {
            localStorage.setItem(this.S_SECRET, data.secret);
            localStorage.setItem(this.S_CODE, data.code);
        } catch (e) {}
        await this.syncNow();
        updateSyncUI();
        return data.code;
    },

    // Join an existing sync account with a pairing code
    async claim(code) {
        const clean = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (clean.length !== 8) throw new Error("ကုဒ် မမှန်ပါ (စာလုံး ၈ လုံး ဖြစ်ရမယ်)");
        const formatted = clean.slice(0, 4) + "-" + clean.slice(4);
        const data = await this._post("/api/sync/claim", { code: formatted, device_name: this.deviceName() });
        try {
            localStorage.setItem(this.S_SECRET, data.secret);
            localStorage.setItem(this.S_CODE, data.code);
        } catch (e) {}
        this.lastSync = 0; // full pull on first join
        await this.syncNow();
        updateSyncUI();
        return data.code;
    },

    async push() {
        if (!this.isPaired()) return null;
        const anns = AnnotationManager.changedSince(this.lastSync);
        const hist = (typeof HistoryManager !== "undefined") ? HistoryManager.changedSince(this.lastSync) : [];
        // Bookmarks ride the history channel with kind="bookmark"
        const bmHist = (typeof BookmarkManager !== "undefined") ? BookmarkManager.changedSince(this.lastSync) : [];
        return this._post("/api/sync/push", { secret: this.secret, annotations: anns, history: hist.concat(bmHist) });
    },

    async pull(watermark) {
        if (!this.isPaired()) return null;
        const data = await this._post("/api/sync/pull", { secret: this.secret, since: this.lastSync });
        const changed = AnnotationManager.mergeRemote(data.annotations || []);
        // Route bookmark rows to BookmarkManager; HistoryManager only handles
        // reading/search (it would otherwise misfile bookmarks as reading).
        const allHist = data.history || [];
        const bmRows = allHist.filter(r => r && r.kind === "bookmark");
        const otherRows = allHist.filter(r => !r || r.kind !== "bookmark");
        let bmChanged = false;
        if (typeof BookmarkManager !== "undefined") {
            bmChanged = BookmarkManager.mergeRemote(bmRows);
        }
        let histChanged = false;
        if (typeof HistoryManager !== "undefined") {
            histChanged = HistoryManager.mergeRemote(otherRows);
        }
        if (changed) {
            renderAnnotationSidebar();
            applyAnnotationsToCurrentPage();
        }
        if (histChanged) {
            HistoryManager.updateBadgeCounts();
            // Re-render the history modal if it is currently open
            const modal = document.getElementById("historyModal");
            if (modal && modal.classList.contains("open") && typeof renderHistoryModalContent === "function") {
                renderHistoryModalContent();
            }
        }
        if (bmChanged && typeof loadBookmarks === "function") {
            loadBookmarks();
        }
        // Watermark = client time at sync start (not server_time): entries are
        // stamped with the client clock, so the watermark must be too — and it
        // must not advance past entries created while this sync was in flight,
        // or they would never be pushed.
        this.lastSync = (typeof watermark === "number" && watermark > 0)
            ? watermark : (data.server_time || Date.now());
        return data;
    },

    async syncNow() {
        if (!this.isPaired()) return;
        setSyncStatus("syncing");
        const t0 = Date.now();
        try {
            await this.push();
            await this.pull(t0);
            setSyncStatus("ok");
        } catch (e) {
            console.warn("Sync failed:", e);
            setSyncStatus("error");
        }
        updateSyncUI();
    },

    // Debounced push after local changes
    schedulePush() {
        if (!this.isPaired()) return;
        clearTimeout(this._pushTimer);
        setSyncStatus("pending");
        this._pushTimer = setTimeout(() => this.syncNow(), 2500);
    },

    async leave() {
        try {
            if (this.isPaired()) await this._post("/api/sync/leave", { secret: this.secret });
        } catch (e) { /* ignore */ }
        try {
            localStorage.removeItem(this.S_SECRET);
            localStorage.removeItem(this.S_CODE);
            localStorage.removeItem(this.S_LAST);
        } catch (e) {}
        updateSyncUI();
    }
};

function _fmtSyncTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function setSyncStatus(state) {
    const el = document.getElementById("syncStatusLine");
    if (!el) return;
    const last = SyncManager.lastSync;
    if (!SyncManager.isPaired()) {
        el.innerHTML = `☁️ <span>sync မလုပ်ရသေး</span>`;
        el.className = "sync-status";
        return;
    }
    const map = {
        syncing: [`☁️ <span>sync လုပ်နေတယ်…</span>`, "sync-status syncing"],
        pending: [`☁️ <span>• စောင့်နေတယ်</span>`, "sync-status"],
        ok: [`☁️ <span>✓ ${_fmtSyncTime(last) || "ပြီးပြီ"}</span>`, "sync-status ok"],
        error: [`☁️ <span>sync မအောင်မြင်ပါ — နှိပ်ပြီး ပြန်လုပ်ပါ</span>`, "sync-status error"],
    };
    const [html, cls] = map[state] || map.ok;
    el.innerHTML = html;
    el.className = cls;
}

function updateSyncUI() {
    setSyncStatus(SyncManager.isPaired() ? "ok" : "unpaired");
    const codeEl = document.getElementById("syncCodeDisplay");
    if (codeEl && SyncManager.isPaired()) codeEl.textContent = SyncManager.code || "";
    if (document.getElementById("syncModal").style.display !== "none") renderSyncModal();
}

// --- Sync modal ---
function openSyncModal() {
    renderSyncModal();
    document.getElementById("syncModal").style.display = "flex";
}
function closeSyncModal() {
    document.getElementById("syncModal").style.display = "none";
}

function renderSyncModal() {
    const body = document.getElementById("syncModalBody");
    if (!body) return;
    if (!SyncManager.isPaired()) {
        body.innerHTML = `
            <p class="sync-desc">ဖုန်း / ကွန်ပျူတာ အားလုံးမှာ မှတ်ချက်တွေနဲ့ ဖတ်ရှု/ရှာဖွေ မှတ်တမ်းတွေ တူညီအောင် sync ကုဒ်နဲ့ ချိတ်ပါ။</p>
            <button id="btnSyncCreate" class="sync-primary-btn">🔑 ကုဒ်အသစ် ထုတ်ရန်</button>
            <div class="sync-divider"><span>သို့မဟုတ်</span></div>
            <label class="sync-label">ရှိပြီးသား ကုဒ်နဲ့ ချိတ်ရန်</label>
            <div class="sync-join-row">
                <input id="syncCodeInput" class="sync-code-input" placeholder="XXXX-XXXX" maxlength="9"
                       autocapitalize="characters" autocomplete="off" spellcheck="false" />
                <button id="btnSyncClaim" class="sync-secondary-btn">ချိတ်မည်</button>
            </div>
            <div id="syncModalMsg" class="sync-msg"></div>`;
        document.getElementById("btnSyncCreate").addEventListener("click", async (e) => {
            const btn = e.currentTarget, msg = document.getElementById("syncModalMsg");
            btn.disabled = true; msg.textContent = "ကုဒ် ထုတ်နေတယ်…";
            try {
                await SyncManager.create();
                renderSyncModal();
            } catch (err) {
                msg.textContent = "မအောင်မြင်ပါ: " + (err.message || err);
                btn.disabled = false;
            }
        });
        const doClaim = async () => {
            const input = document.getElementById("syncCodeInput");
            const msg = document.getElementById("syncModalMsg");
            msg.textContent = "ချိတ်နေတယ်…";
            try {
                await SyncManager.claim(input.value);
                renderSyncModal();
            } catch (err) {
                msg.textContent = "မအောင်မြင်ပါ: " + (err.message || err);
            }
        };
        document.getElementById("btnSyncClaim").addEventListener("click", doClaim);
        document.getElementById("syncCodeInput").addEventListener("keydown", (e) => {
            if (e.key === "Enter") doClaim();
        });
    } else {
        body.innerHTML = `
            <p class="sync-desc">ဒီကုဒ်ကို နောက် device မှာ ရိုက်ထည့်ပြီး ချိတ်နိုင်တယ်။</p>
            <div class="sync-code-box">
                <span id="syncCodeDisplay" class="sync-code">${escapeHtml(SyncManager.code || "")}</span>
                <button id="btnSyncCopyCode" class="sync-secondary-btn">📋 ကူးရန်</button>
            </div>
            <div id="syncModalMsg" class="sync-msg"></div>
            <div class="sync-info" id="syncInfoLine">…</div>
            <div class="sync-actions">
                <button id="btnSyncNow" class="sync-primary-btn">🔄 ယခု Sync လုပ်ရန်</button>
                <button id="btnSyncLeave" class="sync-danger-btn">🔌 ဒီ device ကို ဖြုတ်ရန်</button>
            </div>`;
        document.getElementById("btnSyncCopyCode").addEventListener("click", async () => {
            const msg = document.getElementById("syncModalMsg");
            try {
                await navigator.clipboard.writeText(SyncManager.code || "");
                msg.textContent = "ကုဒ် ကူးပြီးပြီ ✓";
            } catch (e) { msg.textContent = "ကူးမရပါ၊ ကုဒ်ကို လက်နဲ့ မှတ်ပါ"; }
        });
        document.getElementById("btnSyncNow").addEventListener("click", () => SyncManager.syncNow());
        document.getElementById("btnSyncLeave").addEventListener("click", async () => {
            if (confirm("ဒီ device ကို sync ကနေ ဖြုတ်မှာလား? (မှတ်ချက်နဲ့ မှတ်တမ်းတွေက ဒီ device မှာ ကျန်မယ်)")) {
                await SyncManager.leave();
                renderSyncModal();
            }
        });
        SyncManager._post("/api/sync/status", { secret: SyncManager.secret })
            .then(s => {
                const line = document.getElementById("syncInfoLine");
                if (line) line.textContent = `📱 devices: ${s.devices} • 📝 မှတ်ချက်များ: ${s.annotations} • 🕘 မှတ်တမ်း: ${s.history || 0}`;
            })
            .catch(() => {});
    }
}

function setupSyncUI() {
    const openBtn = document.getElementById("btnOpenSync");
    if (openBtn) openBtn.addEventListener("click", openSyncModal);
    const closeBtn = document.getElementById("btnCloseSyncModal");
    if (closeBtn) closeBtn.addEventListener("click", closeSyncModal);
    const modal = document.getElementById("syncModal");
    if (modal) {
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeSyncModal();
            e.stopPropagation();
        });
    }
    const statusEl = document.getElementById("syncStatusLine");
    if (statusEl) statusEl.addEventListener("click", () => {
        if (SyncManager.isPaired()) SyncManager.syncNow();
        else openSyncModal();
    });
    updateSyncUI();
    // One-time migration: backfill updatedAt on old history entries and do a
    // full sync once so pre-existing history converges across devices.
    try {
        if (!localStorage.getItem("tipitaka_sync_history_migrated_v1")) {
            if (typeof HistoryManager !== "undefined") HistoryManager.backfillUpdatedAt();
            if (SyncManager.isPaired()) SyncManager.lastSync = 0;
            localStorage.setItem("tipitaka_sync_history_migrated_v1", "1");
        }
    } catch (e) {}
    // Initial background sync shortly after app start
    if (SyncManager.isPaired()) setTimeout(() => SyncManager.syncNow(), 4000);
    // Re-sync when returning to the app after a while
    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && SyncManager.isPaired()
            && Date.now() - SyncManager.lastSync > 10 * 60 * 1000) {
            SyncManager.syncNow();
        }
    });
}

// ---------------- Book export: download as Word (.docx) / PDF ----------------
function getExportBookInfo() {
    const mode = state.readerMode === "mm" ? "mm" : "pali";
    if (mode === "mm") {
        return { mode: mode, bookId: state.mmBookId, bookName: state.mmBookName || "မြန်မာပြန်",
                 first: state.mmFirstPage || 1, last: state.mmLastPage || 1, edition: "မြန်မာပြန်" };
    }
    return { mode: mode, bookId: state.paliBookId, bookName: state.paliBookName || "ပါဠိတော်",
             first: state.paliFirstPage || 1, last: state.paliLastPage || 1, edition: "ပါဠိတော်" };
}

function openExportModal() {
    const info = getExportBookInfo();
    const body = document.getElementById("exportModalBody");
    if (!body) return;
    body.innerHTML =
    '<div class="export-form">' +
        '<div>' +
            '<div class="export-book-name">' + escapeHtml(info.bookName) + '</div>' +
            '<div class="export-book-meta">' + escapeHtml(info.edition) + ' • စာမျက်နှာစုစုပေါင်း ' + toMyanmarNum(info.last - info.first + 1) + '</div>' +
        '</div>' +
        '<div>' +
            '<span class="export-group-label">ဒေါင်းလုဒ်ဆွဲမည့်အပိုင်း</span>' +
            '<label class="export-radio-row"><input type="radio" name="exportScope" value="all" checked> တစ်အုပ်လုံး (စာမျက်နှာ ' + toMyanmarNum(info.first) + '–' + toMyanmarNum(info.last) + ')</label>' +
            '<label class="export-radio-row"><input type="radio" name="exportScope" value="range"> အပိုင်းအခြား</label>' +
            '<div class="export-range-inputs" id="exportRangeInputs" style="display:none;">' +
                '<input type="number" id="exportFrom" value="' + info.first + '" min="' + info.first + '" max="' + info.last + '">' +
                '<span>မှ</span>' +
                '<input type="number" id="exportTo" value="' + info.last + '" min="' + info.first + '" max="' + info.last + '">' +
                '<span>ထိ</span>' +
            '</div>' +
        '</div>' +
        '<div>' +
            '<span class="export-group-label">ဖိုင်အမျိုးအစား</span>' +
            '<label class="export-radio-row"><input type="radio" name="exportFormat" value="docx" checked> Word (.docx)</label>' +
        '</div>' +
        '<button class="export-dl-btn" id="btnStartExport">⤓ ဒေါင်းလုဒ်ဆွဲမယ်</button>' +
        '<div class="export-status" id="exportStatus"></div>' +
    '</div>';
    body.querySelectorAll('input[name="exportScope"]').forEach(function(r) {
        r.addEventListener("change", function() {
            document.getElementById("exportRangeInputs").style.display =
                body.querySelector('input[name="exportScope"]:checked').value === "range" ? "flex" : "none";
        });
    });
    document.getElementById("btnStartExport").addEventListener("click", startExport);
    document.getElementById("exportModal").style.display = "flex";
}

function closeExportModal() {
    document.getElementById("exportModal").style.display = "none";
}

async function startExport() {
    const info = getExportBookInfo();
    const btn = document.getElementById("btnStartExport");
    const status = document.getElementById("exportStatus");
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    const format = document.querySelector('input[name="exportFormat"]:checked').value;
    let pFrom = info.first, pTo = info.last;
    if (scope === "range") {
        pFrom = parseInt(document.getElementById("exportFrom").value, 10);
        pTo = parseInt(document.getElementById("exportTo").value, 10);
        if (!Number.isFinite(pFrom) || !Number.isFinite(pTo)) {
            status.textContent = "စာမျက်နှာနံပါတ် မှန်အောင်ဖြည့်ပါ။";
            status.classList.add("error");
            return;
        }
        pFrom = Math.max(info.first, Math.min(info.last, pFrom));
        pTo = Math.max(info.first, Math.min(info.last, pTo));
        if (pFrom > pTo) { const t = pFrom; pFrom = pTo; pTo = t; }
    }
    status.classList.remove("error");
    status.textContent = "ပြင်ဆင်နေပါသည်… (စာမျက်နှာ " + toMyanmarNum(pFrom) + "–" + toMyanmarNum(pTo) + ")";
    btn.disabled = true;
    try {
        const url = "/api/export/" + info.mode + "/" + encodeURIComponent(info.bookId) +
            "?from=" + pFrom + "&to=" + pTo + "&format=" + format;
        const res = await fetch(url);
        if (!res.ok) {
            let msg = "ဒေါင်းလုဒ်မရပါ။";
            if (res.status === 429) msg = "ခဏစောင့်ပြီးမှ ပြန်လုပ်ပါ (တစ်နာရီ ၁၀ ခါသာ)။";
            else if (res.status === 404) msg = "စာအုပ်မတွေ့ပါ။";
            else { try { const j = await res.json(); if (j.error) msg = j.error; } catch (e) {} }
            throw new Error(msg);
        }
        const blob = await res.blob();
        let filename = "tipitaka_" + info.bookId + "_p" + pFrom + "-" + pTo + "." + format;
        const disp = res.headers.get("Content-Disposition") || "";
        const m = /filename=([^;]+)/.exec(disp);
        if (m) filename = m[1].trim();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
        status.textContent = "✅ ဒေါင်းလုဒ်ရရှိပါပြီ။";
        setTimeout(closeExportModal, 1200);
    } catch (e) {
        status.textContent = "❌ " + e.message;
        status.classList.add("error");
    } finally {
        btn.disabled = false;
    }
}

function setupExportUI() {
    const openBtn = document.getElementById("btnExportBook");
    if (openBtn) openBtn.addEventListener("click", openExportModal);
    const closeBtn = document.getElementById("btnCloseExportModal");
    if (closeBtn) closeBtn.addEventListener("click", closeExportModal);
    const modal = document.getElementById("exportModal");
    if (modal) {
        modal.addEventListener("click", function(e) {
            if (e.target === modal) closeExportModal();
            e.stopPropagation();
        });
    }
}

// ============================================================
// Page Jump Sheet (v6.11): tap footer "စာမျက်နှာ X / Y" to open.
// Slider with live page bubble (jump on release), section ticks
// (tap -> nearest sutta/chapter start), exact page input.
// ============================================================
let _jumpFirst = 1, _jumpLast = 1;

function _jumpIsMM() { return state.readerMode === "mm"; }
// Nissaya mode reads the same Pāḷi book/page as Pāḷi mode — only presentation differs.
function _isPaliReaderMode() { return state.readerMode === "pali" || state.readerMode === "nissaya"; }

// Inline page jump (v7.39): the footer pill toggles an input row in normal
// flow inside the footer. No overlay, no dialog, no slider, no ticks,
// no DOM moves — the hang vectors of the old jump sheet are gone by design.
function _jumpRange() {
    const isMM = _jumpIsMM();
    _jumpFirst = isMM ? (state.mmFirstPage || 1) : (state.paliFirstPage || 1);
    _jumpLast = isMM ? (state.mmLastPage || 1) : (state.paliLastPage || 1);
}
function _jumpInlineToggle() {
    if (!el.jumpInlineRow) return;
    // Clear any text selection (mobile taps can select text).
    try { if (window.getSelection) window.getSelection().removeAllRanges(); } catch (_) {}
    if (el.jumpInlineRow.hidden) {
        // v7.43: only one jump UI at a time — dismiss any open badge row.
        const badgeRow = document.getElementById("jumpBadgeRow");
        if (badgeRow) badgeRow.remove();
        _jumpRange();
        el.jumpInlineInput.value = "";
        el.jumpInlineInput.placeholder = `${toMyanmarNum(_jumpFirst)}\u2013${toMyanmarNum(_jumpLast)}`;
        el.jumpInlineRow.hidden = false;
    } else {
        el.jumpInlineRow.hidden = true;
        if (el.jumpInlineInput) el.jumpInlineInput.blur();
    }
}
// v7.42: divider badge tap → inline jump row right below the badge.
// A fresh row is built per tap (no shared/moved element), so feed reloads
// (innerHTML resets) and pruneFeedDOM can never strand a stale reference.
// Tapping the same badge again closes its row (toggle).
function _jumpBadgeToggle(badge) {
    if (!badge || !badge.closest) return;
    const divider = badge.closest(".page-divider");
    if (!divider) return;
    // Clear any text selection (mobile taps can select text).
    try { if (window.getSelection) window.getSelection().removeAllRanges(); } catch (_) {}
    const existing = document.getElementById("jumpBadgeRow");
    if (existing) {
        const atThisBadge = existing.previousElementSibling === divider;
        existing.remove();
        if (atThisBadge) return;
    }
    // Only one jump UI at a time: hide the footer row.
    if (el.jumpInlineRow) el.jumpInlineRow.hidden = true;
    _jumpRange();
    const row = document.createElement("div");
    row.className = "jump-inline-row";
    row.id = "jumpBadgeRow";
    const lo = toMyanmarNum(_jumpFirst), hi = toMyanmarNum(_jumpLast);
    row.innerHTML =
        '<span class="jump-inline-label">စာမျက်နှာ</span>' +
        `<input type="text" class="jump-inline-input" inputmode="numeric" pattern="[0-9\\u1040-\\u1049]*" enterkeyhint="go" ` +
        `placeholder="${lo}\u2013${hi}" autocomplete="off" aria-label="သွားလိုသော စာမျက်နှာ">` +
        '<button class="jump-inline-go" type="button">သွားမည်</button>' +
        '<button class="jump-inline-close" type="button" aria-label="ပိတ်ရန်">✕</button>';
    const input = row.querySelector(".jump-inline-input");
    const goBtn = row.querySelector(".jump-inline-go");
    const closeBtn = row.querySelector(".jump-inline-close");
    const submit = () => {
        const p = fromMyanmarNum((input.value || "").trim());
        if (p > 0) { row.remove(); _jumpGo(p); }
        else { try { input.focus(); input.select(); } catch (_) {} }
    };
    goBtn.addEventListener("click", (e) => { e.stopPropagation(); submit(); });
    closeBtn.addEventListener("click", (e) => { e.stopPropagation(); row.remove(); });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        else if (e.key === "Escape") row.remove();
    });
    // Keep badge-row taps from bubbling to the reader container's badge toggle
    // or the dictionary word-tap handler.
    row.addEventListener("click", (e) => e.stopPropagation());
    divider.insertAdjacentElement("afterend", row);
}
function _jumpInlineSubmit() {
    if (!el.jumpInlineInput) return;
    const p = fromMyanmarNum((el.jumpInlineInput.value || "").trim());
    if (p > 0) {
        el.jumpInlineRow.hidden = true;
        _jumpGo(p);
    } else {
        el.jumpInlineInput.focus();
        try { el.jumpInlineInput.select(); } catch (_) {}
    }
}

function _jumpGo(page) {
    clearPendingSearch();
    _trackAction("_jumpGo", page);    page = Math.max(_jumpFirst, Math.min(_jumpLast, Math.round(page)));
    // Prune feed DOM before loading the target page to prevent accumulation
    // across repeated jumps (each jump adds pages; prune keeps window small).
    try { pruneFeedDOM(); } catch (e) {}
    if (_jumpIsMM()) loadMMPage(state.mmBookId, page);
    else loadPaliPage(state.paliBookId, page);
}

function setupInlineJump() {
    if (el.btnOpenJumpSheet) el.btnOpenJumpSheet.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        _jumpInlineToggle();
    });
    // v7.38 hardening kept: block Android WebView long-press copy menu on the pill.
    if (el.btnOpenJumpSheet) el.btnOpenJumpSheet.addEventListener("contextmenu", (e) => e.preventDefault());
    // v7.38 hardening kept: clear any selection at touchstart (passive: keeps click intact).
    if (el.btnOpenJumpSheet) el.btnOpenJumpSheet.addEventListener("touchstart", () => {
        try {
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.rangeCount > 0) sel.removeAllRanges();
        } catch (_) {}
    }, { passive: true });
    // v7.42: divider badge tap → inline jump row right below the badge.
    // (Restores the pre-v7.39 learned interaction; v7.39's static badges left
    // continuous-scroll readers with no reachable jump UI.)
    if (el.readerContainer) el.readerContainer.addEventListener("click", (e) => {
        const badge = e.target && e.target.closest ? e.target.closest(".divider-badge") : null;
        if (!badge) return;
        e.preventDefault();
        e.stopPropagation();
        _jumpBadgeToggle(badge);
    });
    // NOTE (v7.39): divider badges are static citation labels — no handlers.
    if (el.btnJumpInlineGo) el.btnJumpInlineGo.addEventListener("click", _jumpInlineSubmit);
    if (el.btnJumpInlineClose) el.btnJumpInlineClose.addEventListener("click", () => {
        if (el.jumpInlineRow) el.jumpInlineRow.hidden = true;
    });
    if (el.jumpInlineInput) el.jumpInlineInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") _jumpInlineSubmit();
        else if (e.key === "Escape" && el.jumpInlineRow) el.jumpInlineRow.hidden = true;
    });
}

// ============================================================
// Hang watchdog (v6.14): detects main-thread stalls and tells the user.
// A rAF heartbeat records every frame; if the gap between frames exceeds
// HANG_THRESHOLD_MS while the page is visible, the UI thread was blocked
// (frozen). On recovery a non-blocking toast shows how long it froze, with
// a one-tap reload. Visibility changes reset the heartbeat so returning
// from background never triggers a false alarm.
// ============================================================
// Last user action tracker for hang diagnostics: updated on every
// navigation interaction so the HangWatchdog can report WHAT the user
// was doing when the main thread stalled.
window._lastUserAction = "init";
function _trackAction(name, detail) {
    try {
        window._lastUserAction = detail ? `${name}(${detail})` : name;
    } catch (e) {}
}

const HangWatchdog = {
    HANG_THRESHOLD_MS: 6000,
    COOLDOWN_MS: 120000,
    _lastFrame: 0,
    _lastWarn: 0,
    init() {
        this._lastFrame = performance.now();
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) this._lastFrame = performance.now();
        });
        const tick = () => {
            const now = performance.now();
            const gap = now - this._lastFrame;
            this._lastFrame = now;
            if (gap > this.HANG_THRESHOLD_MS && !document.hidden) this._onHang(gap);
            requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },
    _onHang(gapMs) {
        const now = Date.now();
        if (now - this._lastWarn < this.COOLDOWN_MS) return;
        this._lastWarn = now;
        const secs = Math.round(gapMs / 1000);
        const lastAction = window._lastUserAction || "unknown";
        const book = (state.readerMode === "mm") ? state.mmBookId : state.paliBookId;
        const page = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        const domNodes = document.getElementsByTagName("*").length;
        const diag = `action=${lastAction} book=${book} page=${page} nodes=${domNodes}`;
        console.warn(`[hang-watchdog] main thread blocked ~${secs}s | ${diag}`);
        showAppToast(
            `⚠️ ${toMyanmarNum(secs)} စက္ကန့်ရပ်ဆိုင်းသွားသည် (${diag})`,
            { actionLabel: "↻ ပြန်ဖွင့်မည်", onAction: () => location.reload(), timeout: 15000 }
        );
    }
};

// Minimal non-blocking toast (no dependency on any UI framework).
let _appToastTimer = null;
function showAppToast(message, opts = {}) {
    let toast = document.getElementById("appToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "appToast";
        toast.className = "app-toast";
        toast.innerHTML = `<span class="app-toast-msg"></span>
            <button class="app-toast-action" type="button"></button>
            <button class="app-toast-close" type="button" aria-label="ပိတ်ရန်">✕</button>`;
        document.body.appendChild(toast);
        toast.querySelector(".app-toast-close").addEventListener("click", hideAppToast);
    }
    toast.querySelector(".app-toast-msg").textContent = message;
    const actionBtn = toast.querySelector(".app-toast-action");
    if (opts.actionLabel) {
        actionBtn.style.display = "";
        actionBtn.textContent = opts.actionLabel;
        actionBtn.onclick = () => { hideAppToast(); if (opts.onAction) opts.onAction(); };
    } else {
        actionBtn.style.display = "none";
        actionBtn.onclick = null;
    }
    toast.classList.add("show");
    if (_appToastTimer) clearTimeout(_appToastTimer);
    _appToastTimer = setTimeout(hideAppToast, opts.timeout || 6000);
}
function hideAppToast() {
    const toast = document.getElementById("appToast");
    if (toast) toast.classList.remove("show");
    if (_appToastTimer) { clearTimeout(_appToastTimer); _appToastTimer = null; }
}

// Setup annotation popup event listeners (called once in setupEventListeners)
function setupAnnotationListeners() {
    const popup = document.getElementById("annotationPopup");
    if (!popup) return;

    // Prevent clicks inside the popup from triggering the global
    // word-lookup / bar-toggle handler in click.js
    popup.addEventListener("click", (e) => { e.stopPropagation(); });

    // Color selection
    popup.querySelectorAll(".ann-color-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            _annSelectedColor = btn.getAttribute("data-color");
            popup.querySelectorAll(".ann-color-btn").forEach(b => b.classList.remove("selected"));
            btn.classList.add("selected");
        });
    });

    // Save
    const saveBtn = document.getElementById("btnSaveAnnotation");
    if (saveBtn) saveBtn.addEventListener("click", saveAnnotation);

    // Delete
    const delBtn = document.getElementById("btnDeleteAnnotation");
    if (delBtn) delBtn.addEventListener("click", deleteAnnotationFromPopup);

    // Close button
    const closeBtn = document.getElementById("btnCloseAnnotationPopup");
    if (closeBtn) closeBtn.addEventListener("click", closeAnnotationPopup);

    // Click outside to close
    document.addEventListener("click", (e) => {
        if (popup.style.display !== "none" && !popup.contains(e.target)) {
            closeAnnotationPopup();
        }
    });

    // Escape key
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && popup.style.display !== "none") closeAnnotationPopup();
    });

    // Clear all annotations button in sidebar
    const clearBtn = document.getElementById("btnClearAnnotations");
    if (clearBtn) {
        clearBtn.addEventListener("click", () => {
            if (confirm("မှတ်ချက်အားလုံးကို ဖျက်ပစ်ရန် သေချာပါသလား?")) {
                AnnotationManager.clearAll();
                renderAnnotationSidebar();
                applyAnnotationsToCurrentPage();
                SyncManager.schedulePush();
            }
        });
    }

    // Text-selection annotation (select text → mini toolbar → save)
    setupSelectionAnnotation();
    // Tap a highlight to edit it
    setupHighlightTapToEdit();
    // Cross-device sync UI + background sync
    setupSyncUI();
    setupExportUI();
    // Page jump sheet (footer "စာမျက်နှာ X / Y" tap -> slider + ticks + input)
    setupInlineJump();
    // Main-thread hang watchdog -> user-visible warning toast
    HangWatchdog.init();
}

// Initialize Application
async function initApp() {
    setupTheme(state.theme);
    setupFontSize(state.fontSize);
    setNotesVisibility(state.showNotes);
    setScrollMode(state.scrollMode);
    setupEventListeners();
    setupAnnotationListeners();
    
    // Always start on Home page when entering the web app
    localStorage.removeItem("tipitaka_app_view");
    setAppView("home");

    const domLink = document.getElementById("appCurrentDomainLink");
    if (domLink && window.location.origin) {
        domLink.textContent = window.location.origin;
    }

    if (!state.isSidebarOpen) el.appSidebar.classList.add("collapsed");
    if (!state.isDictOpen || state.appView === "home") el.dictSidebar.classList.add("collapsed");
    el.btnToggleDict.classList.toggle("active", state.isDictOpen && state.appView !== "home");
    
    // loadCategories and loadBookmarks are independent — run concurrently.
    await Promise.all([loadCategories(), loadBookmarks()]);
    HistoryManager.updateBadgeCounts();

    // Preload recent book info in background without altering view or display styles.
    // Uses only the device-local reading history. (The old global /api/recent
    // endpoint was shared across all visitors, so it is no longer consulted.)
    try {
        const hist = HistoryManager.getReadingHistory();
        if (hist && hist.length > 0) {
            state.paliBookId = hist[0].bookId;
            state.paliPage = hist[0].page || 1;
        } else {
            state.paliBookId = "mula_vi_01";
            state.paliPage = 1;
        }
    } catch (e) {
        state.paliBookId = "mula_vi_01";
        state.paliPage = 1;
    }

    // Deep link from the bridge (?book=&page=) or a shared search (?search=).
    handleDeepLink();
    updateOriginalImageBtn();
}

// ----------------- Categories & Initialization -----------------

async function loadCategories() {
    // Fetch both category lists concurrently — they are independent.
    const [resPali, resMM] = await Promise.allSettled([
        fetch("/api/categories"),
        fetch("/api/mm/categories")
    ]);
    if (resPali.status === "fulfilled" && resPali.value.ok) {
        state.paliCategories = await resPali.value.json();
    } else if (resPali.status === "rejected") {
        console.error("Failed to load Pali categories:", resPali.reason);
    }
    if (resMM.status === "fulfilled" && resMM.value.ok) {
        state.mmCategories = await resMM.value.json();
    } else if (resMM.status === "rejected") {
        console.error("Failed to load MM categories:", resMM.reason);
    }

    renderBooksTree();
    renderHomeCatalog();
}

async function loadRecentOrFirst() {
    const list = HistoryManager.getReadingHistory();
    if (list && list.length > 0) {
        const top = list[0];
        if (top.mode === "mm") {
            setReaderMode("mm");
            await loadMMBook(top.bookId, top.page);
        } else if (top.mode === "nissaya") {
            setReaderMode("nissaya");
            await loadPaliBook(top.bookId, top.page);
        } else if (top.mode === "split") {
            setReaderMode("split");
            await loadPaliBook(top.bookId, top.page);
            if (top.splitMMBookId) await loadMMPage(top.splitMMBookId, top.splitMMPage || 1);
        } else {
            setReaderMode("pali");
            await loadPaliBook(top.bookId, top.page);
        }
        return;
    }

    // No local history: start at the default book. (The legacy global
    // /api/recent endpoint is retired — it was shared across all visitors.)
    await loadPaliBook("mula_vi_01", null);
    setReaderMode(state.readerMode);
}

// ----------------- Mode Switcher (Pali / MM / Split) -----------------

function setReaderMode(mode) {
    state.readerMode = mode;
    localStorage.setItem("tipitaka_reader_mode", mode);

    el.btnModePali.classList.toggle("active", mode === "pali");
    el.btnModeMM.classList.toggle("active", mode === "mm");
    if (el.btnModeNissaya) el.btnModeNissaya.classList.toggle("active", mode === "nissaya");
    el.btnModeSplit.classList.toggle("active", mode === "split");

    document.querySelectorAll(".mobile-mode-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-mode") === mode);
    });

    if (mode === "split") {
        if (window.innerWidth <= 768) {
            openEditionSwitcher();
            return;
        }
        el.readerPaper.style.display = "none";
        el.splitViewContainer.style.display = "flex";
        el.paliBasketFilter.style.display = "flex";
        el.metaEditionTag.textContent = "ယှဉ်တွဲဖတ်ရှုခြင်း";
        el.btnCrossLink.style.display = "none";
        if (el.btnCrossLinkNissaya) el.btnCrossLinkNissaya.style.display = "none";
        if (el.btnToggleNotes) el.btnToggleNotes.style.display = "inline-flex";
        if (el.mobileNotesRow) el.mobileNotesRow.style.display = "block";
        el.relatedDropdownWrapper.style.display = "none";
        renderSplitView();
    } else if (mode === "mm") {
        el.readerPaper.style.display = "flex";
        el.splitViewContainer.style.display = "none";
        el.paliBasketFilter.style.display = "none";
        el.metaEditionTag.textContent = "မြန်မာပြန်";
        el.btnCrossLink.style.display = "inline-flex";
        if (el.btnCrossLinkNissaya) el.btnCrossLinkNissaya.style.display = "inline-flex";
        if (el.crossLinkIcon) el.crossLinkIcon.textContent = "☸️";
        if (el.crossLinkLabel) el.crossLinkLabel.textContent = "ပါဠိတော်သို့";
        if (el.btnToggleNotes) el.btnToggleNotes.style.display = "none";
        if (el.mobileNotesRow) el.mobileNotesRow.style.display = "none";
        el.relatedDropdownWrapper.style.display = "none";
        // Immediate feedback: never leave the paper blank while the book/page loads
        el.paliContent.innerHTML = `<div class="loading-state">မြန်မာပြန် စာမျက်နှာ ဖွင့်လှစ်နေပါသည်...</div>`;
        loadMMBook(state.mmBookId, state.mmPage);
    } else { // 'pali' or 'nissaya' — nissaya mode reads the same Pāḷi book/page,
             // rendered with nissaya glosses as the primary text
        const isNissaya = (mode === "nissaya");
        el.readerPaper.style.display = "flex";
        el.splitViewContainer.style.display = "none";
        el.paliBasketFilter.style.display = "flex";
        el.metaEditionTag.textContent = isNissaya ? "မြန်မာ နိဿယ" : "ပါဠိတော်";
        el.btnCrossLink.style.display = "inline-flex";
        if (el.crossLinkIcon) el.crossLinkIcon.textContent = "🇲🇲";
        if (el.crossLinkLabel) el.crossLinkLabel.textContent = "မြန်မာပြန်သို့";
        if (el.btnCrossLinkNissaya) el.btnCrossLinkNissaya.style.display = isNissaya ? "none" : "inline-flex";
        if (el.btnToggleNotes) el.btnToggleNotes.style.display = "inline-flex";
        if (el.mobileNotesRow) el.mobileNotesRow.style.display = "block";
        // Immediate feedback: never leave the paper blank while the book/page loads
        el.paliContent.innerHTML = `<div class="loading-state">${isNissaya ? "နိဿယ စာမျက်နှာ ဖွင့်လှစ်နေပါသည်..." : "စာမျက်နှာ ဖွင့်လှစ်နေပါသည်..."}</div>`;
        loadPaliBook(state.paliBookId, state.paliPage);
    }
    // Re-render sidebar lists: the book metadata (and its renderTOC/renderSuttas
    // calls) is skipped when the same book is already loaded, which would leave
    // the other language's TOC visible after a reader-mode switch.
    renderTOC();
    renderSuttas();
    highlightActiveBookInSidebar();
    renderBooksTree();
    renderHomeCatalog();
    updateNissayaToggleLabel();

    if (state.appView === "reader" && window.innerWidth > 992) {
        state.isSidebarOpen = true;
        if (el.appSidebar) el.appSidebar.classList.remove("collapsed");
        switchToSidebarTab("tab-toc");
        const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        highlightActiveToc(curPg, true);
    }
    updateOriginalImageBtn();
}

function handleCrossLink() {
    if (_isPaliReaderMode()) {
        if (state.matchingMM) {
            state.mmBookId = state.matchingMM.book_id;
            state.mmPage = state.matchingMM.page;
        }
        setReaderMode("mm");
    } else {
        if (state.matchingPali) {
            state.paliBookId = state.matchingPali.book_id;
            state.paliPage = state.matchingPali.page;
        }
        setReaderMode("pali");
    }
}

// ----------------- Tipitaka Bridge: view the original scan -----------------
// The bridge (https://tipitaka-bridge.vercel.app) links the text reader with
// the scanned-image reader. Only 148 of the 192 text books have a scanned
// counterpart, so the button is shown only for those books (baked list below,
// generated from the bridge mapping.json — no extra request at startup).
const BRIDGE_MAPPED_BOOKS = new Set(['annya_bi_01', 'annya_bi_02', 'annya_bi_03', 'annya_bi_04', 'annya_vi_01_02', 'annya_vi_01_03', 'annya_vi_01_04', 'annya_vi_02', 'attha_an_01', 'attha_an_02', 'attha_an_03', 'attha_an_04', 'attha_bi_01', 'attha_bi_02', 'attha_bi_03', 'attha_di_01', 'attha_di_02', 'attha_di_03', 'attha_ku_01', 'attha_ku_02_01', 'attha_ku_02_02', 'attha_ku_03', 'attha_ku_04', 'attha_ku_05_01', 'attha_ku_05_02', 'attha_ku_06', 'attha_ku_07', 'attha_ku_08_01', 'attha_ku_08_02', 'attha_ku_09', 'attha_ku_10', 'attha_ku_11', 'attha_ku_12', 'attha_ku_13', 'attha_ku_16', 'attha_ku_17', 'attha_ku_18_01', 'attha_ku_18_02', 'attha_ku_zat_01', 'attha_ku_zat_02', 'attha_ku_zat_03', 'attha_ku_zat_04', 'attha_ku_zat_05', 'attha_ku_zat_06', 'attha_ku_zat_07', 'attha_ma_01_01', 'attha_ma_01_02', 'attha_ma_02', 'attha_ma_03', 'attha_sa_01', 'attha_sa_02', 'attha_sa_03', 'attha_sa_04', 'attha_sa_05', 'attha_vi_01_01', 'attha_vi_01_02', 'attha_vi_02', 'attha_vi_03', 'attha_vi_04', 'mula_an_01', 'mula_an_02', 'mula_an_03', 'mula_an_04', 'mula_an_05', 'mula_an_06', 'mula_an_07', 'mula_an_08', 'mula_an_09', 'mula_an_10', 'mula_an_11', 'mula_bi_01', 'mula_bi_02', 'mula_bi_03', 'mula_bi_04', 'mula_bi_05', 'mula_bi_06_01', 'mula_bi_06_02', 'mula_bi_06_03', 'mula_bi_07_01', 'mula_bi_07_02', 'mula_bi_07_03', 'mula_bi_07_04', 'mula_bi_07_05', 'mula_di_01', 'mula_di_02', 'mula_di_03', 'mula_ku_01', 'mula_ku_02', 'mula_ku_03', 'mula_ku_04', 'mula_ku_05', 'mula_ku_06', 'mula_ku_07', 'mula_ku_08', 'mula_ku_09', 'mula_ku_10', 'mula_ku_11', 'mula_ku_12', 'mula_ku_13', 'mula_ku_14', 'mula_ku_15', 'mula_ku_16', 'mula_ku_17', 'mula_ku_18', 'mula_ku_19', 'mula_ku_21', 'mula_ma_01', 'mula_ma_02', 'mula_ma_03', 'mula_sa_01', 'mula_sa_02', 'mula_sa_03', 'mula_sa_04', 'mula_sa_05', 'mula_vi_01', 'mula_vi_02', 'mula_vi_03', 'mula_vi_04', 'mula_vi_05', 'tika_an_01', 'tika_an_02', 'tika_an_03', 'tika_an_04', 'tika_bi_01', 'tika_bi_02_01', 'tika_bi_02_02', 'tika_bi_03', 'tika_di_01_01', 'tika_di_01_02', 'tika_di_01_03', 'tika_di_02', 'tika_di_03', 'tika_ku_20_02', 'tika_ma_01', 'tika_ma_02', 'tika_ma_03', 'tika_ma_04', 'tika_sa_01', 'tika_sa_02', 'tika_sa_03', 'tika_sa_04', 'tika_sa_05', 'tika_vi_01', 'tika_vi_02', 'tika_vi_03', 'tika_vi_04', 'tika_vi_05', 'tika_vi_06']);

// Show the "view original image" button only in a Pali-based reader mode and
// only when the current book has a scanned counterpart. Runs after every book
// or mode change; also re-fits the header so the overflow manager can move
// the button into the More menu when space is tight.
function updateOriginalImageBtn() {
    const btn = el.btnViewOriginalImage;
    if (!btn) return;
    const show = (state.readerMode === "pali" || state.readerMode === "nissaya" || state.readerMode === "split")
        && BRIDGE_MAPPED_BOOKS.has(state.paliBookId);
    btn.style.display = show ? "inline-flex" : "none";
    if (typeof window.fitHeaderOverflow === "function") window.fitHeaderOverflow();
}

function handleViewOriginalImage() {
    const book = state.paliBookId;
    const page = state.paliPage || 1;
    if (!book) return;
    window.open("https://tipitaka-bridge.vercel.app/to-image?book=" + encodeURIComponent(book) + "&page=" + page, "_blank");
}

// Deep links, used by the bridge's /to-text route (?book=&page=) and by
// shared search links (?search=). Runs once at startup, after the book
// lists have loaded; an unknown book slug is ignored (stay on Home).
function handleDeepLink() {
    let params;
    try {
        params = new URLSearchParams(window.location.search);
    } catch (e) {
        return;
    }
    const dlBook = params.get("book");
    const dlSearch = params.get("search");
    if (dlBook) {
        const known = (state.paliCategories || []).some(function (cat) {
            return (cat.books || []).some(function (b) { return b.id === dlBook; });
        });
        if (!known) return;
        const dlPage = parseInt(params.get("page") || "1", 10) || 1;
        state.paliBookId = dlBook;
        state.paliPage = dlPage;
        setReaderMode("pali");
        setAppView("reader");
    } else if (dlSearch) {
        openSearchModal();
        el.globalSearchInput.value = dlSearch;
        performSearch();
    }
}

// Jump straight from the Pāḷi (or Myanmar translation) into Myanmar Nissaya mode,
// reading the same Pāḷi book/page as the source text.
function handleCrossLinkNissaya() {
    if (state.readerMode === "mm") {
        if (state.matchingPali) {
            state.paliBookId = state.matchingPali.book_id;
            state.paliPage = state.matchingPali.page;
        }
    }
    setReaderMode("nissaya");
    showScrollToast("📜 မြန်မာ နိဿယသို့ ကူးပြောင်းထားပါသည်");
}

// ============================================================
// Mobile Dedicated Reader Toolbar (Option A) & Unified Switcher
// ============================================================

function updateReaderToolbarState() {
    if (!el.toolbarEditionIcon || !el.toolbarEditionLabel) return;

    if (state.readerMode === "mm") {
        el.toolbarEditionIcon.textContent = "🇲🇲";
        el.toolbarEditionLabel.textContent = "မြန်မာ";
    } else if (state.readerMode === "nissaya") {
        el.toolbarEditionIcon.textContent = "📜";
        el.toolbarEditionLabel.textContent = "နိဿယ";
    } else {
        const bookId = state.paliBookId || "";
        if (bookId.startsWith("attha_") || bookId.includes("attha")) {
            el.toolbarEditionIcon.textContent = "📖";
            el.toolbarEditionLabel.textContent = "အဋ္ဌ";
        } else if (bookId.startsWith("tika_") || bookId.includes("tika")) {
            el.toolbarEditionIcon.textContent = "📜";
            el.toolbarEditionLabel.textContent = "ဋီကာ";
        } else {
            el.toolbarEditionIcon.textContent = "☸️";
            el.toolbarEditionLabel.textContent = "ပါဠိ";
        }
    }

    // Dynamic Bookmark status
    const curBookId = (state.readerMode === "mm") ? state.mmBookId : state.paliBookId;
    const curPage = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
    const isBookmarked = BookmarkManager.isBookmarked(curBookId, curPage);
    if (el.toolbarBookmarkIcon) {
        el.toolbarBookmarkIcon.setAttribute("fill", isBookmarked ? "currentColor" : "none");
    }
    if (el.toolbarBookmarkLabel) {
        el.toolbarBookmarkLabel.textContent = isBookmarked ? "မှတ်ပြီး" : "စာမှတ်";
    }
}

// ------------------------------------------------------------
// Unified Edition Switcher ("ကျမ်းရွေး") Modal
// ------------------------------------------------------------
// A Mūla ("root") Pali book id always carries the mula_/annya_ prefix while
// commentaries use attha_/tika_. The "မူလပါဠိတော်" card must never point at a
// commentary volume, otherwise "return to Pali" just re-opens the very
// Aṭṭhakathā/Ṭīkā page the reader is already on.
function isMulaBookId(bookId) {
    return !!bookId && (bookId.startsWith("mula_") || bookId.startsWith("annya_"));
}

// Resolve the Mūla root book of the family that *bookId* belongs to, using the
// companion payload already cached for the book on screen.
function getCachedMulaRoot(bookId) {
    const comp = state.companionData;
    if (!comp || !comp.current || comp.current.id !== bookId) return null;
    if (comp.root_id) return comp.root_id;
    if (comp.mula && comp.mula.length > 0) return comp.mula[0].id;
    return comp.current.basket === "mula" ? bookId : null;
}

async function openEditionSwitcher() {
    if (!el.editionSwitcherBackdrop || !el.editionSwitcherList) return;

    const isMM = (state.readerMode === "mm");
    const curBookId = isMM ? state.mmBookId : state.paliBookId;
    const curBookName = isMM ? (state.mmBookName || "မြန်မာပြန်") : (state.paliBookName || "ပါဠိတော်");
    const curPage = isMM ? state.mmPage : state.paliPage;

    // Subtitle
    if (el.editionSwitcherSubtitle) {
        el.editionSwitcherSubtitle.textContent = `${withVolumeLabel(curBookId, curBookName)} • စာမျက်နှာ ${toMyanmarNum(curPage)}`;
    }

    // 1. Initial fast synchronous render (zero delay)
    let html = "";

    // Hint: every card below jumps to the page that matches the reader's spot.
    html += `
        <div class="edition-switcher-hint">
            🔗 ကတ်တစ်ခုကို နှိပ်လိုက်လျှင် လက်ရှိဖတ်ရှုနေသော စာမျက်နှာနှင့်
            တိုက်ဆိုင်သည့် စာမျက်နှာသို့ အလိုအလျောက် ရောက်ရှိပါမည်။
        </div>
    `;

    // Card 0: ↩ Return to where the reader came from (only while a swap is pending).
    // Skipped when the origin is the Mūla Pāḷi root, because Card 1 below already
    // surfaces that exact book + matched page — a second card would just duplicate it.
    const origin = state.swapOrigin;
    const originCoveredByPaliCard = !!(origin && origin.mode === "pali" && isMulaBookId(origin.bookId));
    if (origin && origin.bookId && origin.bookId !== curBookId && !originCoveredByPaliCard) {
        html += `
            <div class="edition-switcher-card edition-return-card" id="switcherCardReturn"
                 data-type="origin" data-book="${origin.bookId}"
                 data-page="${origin.page || 1}" data-mode="${origin.mode || 'pali'}">
                <div class="edition-card-left">
                    <span class="edition-card-icon">↩</span>
                    <div class="edition-card-texts">
                        <span class="edition-card-title">${escapeHtml(origin.bookName || 'မူလဖတ်ခဲ့သည့်နေရာ')} သို့ ပြန်ရန်</span>
                        <span class="edition-card-desc">အရင် ဖတ်ရှုခဲ့သော စာမျက်နှာသို့ တိုက်ရိုက် ပြန်သွားမည်</span>
                    </div>
                </div>
                <span class="edition-card-badge badge-return">စာ-${toMyanmarNum(origin.page || 1)} ↩</span>
            </div>
        `;
    }

    // Card 1: မူလပါဠိတော် — always the Mūla root of the current text family
    const isPaliMula = (!isMM && isMulaBookId(curBookId));
    let origPaliId, origPaliName, origPaliPage;
    if (isPaliMula) {
        origPaliId = curBookId;
        origPaliName = curBookName;
        origPaliPage = curPage;
    } else if (state.swapOrigin && state.swapOrigin.mode === "pali" && isMulaBookId(state.swapOrigin.bookId)) {
        origPaliId = state.swapOrigin.bookId;
        origPaliName = state.swapOrigin.bookName || "ပါဠိတော်";
        origPaliPage = state.swapOrigin.page || 1;
    } else {
        // Reading a commentary (or resuming from history): fall back to the
        // Mūla root of this family; its page is matched in loadSwitcherProgressiveData.
        origPaliId = (!isMM && getCachedMulaRoot(curBookId)) || state.paliBookId || "mula_vi_01";
        const mulaBooks = (!isMM && state.companionData) ? (state.companionData.mula || []) : [];
        origPaliName = (mulaBooks.find(b => b.id === origPaliId) || {}).name || state.paliBookName || "ပါဠိတော်";
        origPaliPage = (state.swapOrigin && state.swapOrigin.bookId === origPaliId) ? (state.swapOrigin.page || 1) : 1;
    }

    html += `
        <div class="edition-switcher-card ${isPaliMula ? 'active-edition' : ''}" id="switcherCardPali" data-type="pali" data-book="${origPaliId}" data-page="${origPaliPage}">
            <div class="edition-card-left">
                <span class="edition-card-icon">☸️</span>
                <div class="edition-card-texts">
                    <span class="edition-card-title" id="switcherPaliTitle">${escapeHtml(origPaliName)}</span>
                    <span class="edition-card-desc">ဆဋ္ဌသံဂါယနာ မူရင်းပါဠိ</span>
                </div>
            </div>
            <span class="edition-card-badge ${isPaliMula ? 'badge-active' : 'badge-jump'}" id="switcherBadgePali">
                ${isPaliMula ? '✓ ဖတ်ရှုနေဆဲ' : `စာ-${toMyanmarNum(origPaliPage)} သို့ ↩`}
            </span>
        </div>
    `;

    // Card 2: မြန်မာပြန်ကျမ်း
    const isMMActive = isMM;
    const mmBookName = state.mmBookName || "မြန်မာပြန်ကျမ်း";
    html += `
        <div class="edition-switcher-card ${isMMActive ? 'active-edition' : ''}" id="switcherCardMM" data-type="mm" data-book="${state.mmBookId || ''}" data-page="${state.mmPage || 1}">
            <div class="edition-card-left">
                <span class="edition-card-icon">🇲🇲</span>
                <div class="edition-card-texts">
                    <span class="edition-card-title">${escapeHtml(mmBookName)}</span>
                    <span class="edition-card-desc">သာသနာရေးဦးစီးဌာန မူ</span>
                </div>
            </div>
            <span class="edition-card-badge ${isMMActive ? 'badge-active' : 'badge-jump'}" id="switcherBadgeMM">
                ${isMMActive ? '✓ ဖတ်ရှုနေဆဲ' : 'ကူးပြောင်းမည်'}
            </span>
        </div>
    `;

    // Card 3: မြန်မာ နိဿယ အနက်လွှာ (Per-paragraph gloss toggle layer)
    const isNissayaOn = !!state.showNissaya;
    html += `
        <div class="edition-switcher-card edition-layer-card ${isNissayaOn ? 'active-layer' : ''}" id="switcherCardNissaya" data-type="nissaya">
            <div class="edition-card-left">
                <span class="edition-card-icon">📜</span>
                <div class="edition-card-texts">
                    <span class="edition-card-title">မြန်မာ နိဿယ (စကားပြေ အနက်)</span>
                    <span class="edition-card-desc">စာပိုဒ်အလိုက် မြန်မာစကားပြေအနက် ဖွင့်/ပိတ်လွှာ</span>
                </div>
            </div>
            <span class="edition-card-badge ${isNissayaOn ? 'badge-active' : 'badge-muted'}" id="switcherBadgeNissaya">
                ${isNissayaOn ? '✓ ဖွင့်ထားသည်' : 'ပိတ်ထားသည်'}
            </span>
        </div>
    `;

    // Container for Companions (Atthakatha & Tika)
    html += `<div id="switcherCompanionsContainer"></div>`;

    el.editionSwitcherList.innerHTML = html;

    // Attach click to synchronous items
    attachSwitcherItemHandlers();

    // Show modal immediately
    el.editionSwitcherBackdrop.style.display = "flex";
    requestAnimationFrame(() => {
        el.editionSwitcherBackdrop.classList.add("active");
    });
    state.isEditionSwitcherOpen = true;

    // 2. Progressive background data fetching (Target page matching & Companions)
    loadSwitcherProgressiveData(curBookId, curPage, isMM);
}

function attachSwitcherItemHandlers() {
    if (!el.editionSwitcherList) return;
    el.editionSwitcherList.querySelectorAll(".edition-switcher-card").forEach(card => {
        card.onclick = async () => {
            const type = card.getAttribute("data-type");
            const bookId = card.getAttribute("data-book");
            const page = parseInt(card.getAttribute("data-page"), 10) || 1;

            if (type === "origin") {
                // ↩ Jump straight back to the exact book + page the reader
                // left, then forget the pending swap so the card disappears.
                const mode = card.getAttribute("data-mode") || "pali";
                state.swapOrigin = null;
                closeEditionSwitcher();
                if (mode === "mm") {
                    setReaderMode("mm");
                    await loadMMBook(bookId, page);
                } else {
                    if (state.readerMode === "mm") setReaderMode("pali");
                    await loadPaliBook(bookId, page);
                }
                showScrollToast("↩ အရင် ဖတ်ရှုခဲ့သော နေရာသို့ ပြန်ရောက်ပါပြီ");
                updateReaderToolbarState();
                return;
            }

            if (type === "nissaya") {
                const nextState = !state.showNissaya;
                if (state.readerMode === "mm" && nextState) {
                    setReaderMode("pali");
                }
                setNissayaVisibility(nextState);
                card.classList.toggle("active-layer", nextState);
                const badge = card.querySelector("#switcherBadgeNissaya") || card.querySelector(".edition-card-badge");
                if (badge) {
                    badge.className = `edition-card-badge ${nextState ? 'badge-active' : 'badge-muted'}`;
                    badge.textContent = nextState ? '✓ ဖွင့်ထားသည်' : 'ပိတ်ထားသည်';
                }
                showScrollToast(nextState ? "📜 မြန်မာနိဿယ အနက်ကို ဖွင့်ထားပါသည်" : "မြန်မာနိဿယ အနက်ကို ပိတ်လိုက်ပါပြီ");
                return;
            }

            if (card.classList.contains("active-edition")) {
                closeEditionSwitcher();
                return;
            }

            closeEditionSwitcher();

            if (type === "mm") {
                if (!state.swapOrigin || state.swapOrigin.mode !== "pali") {
                    state.swapOrigin = {
                        mode: "pali",
                        bookId: state.paliBookId,
                        page: state.paliPage,
                        bookName: state.paliBookName || "ပါဠိတော်"
                    };
                }
                setReaderMode("mm");
                await loadMMBook(bookId, page);
                showScrollToast(`🇲🇲 မြန်မာပြန် (စာမျက်နှာ ${toMyanmarNum(page)}) သို့ ကူးပြောင်းထားပါသည်`);
            } else {
                // Preserve current origin before navigating
                if (!state.swapOrigin) {
                    state.swapOrigin = {
                        mode: state.readerMode === "mm" ? "mm" : "pali",
                        bookId: state.readerMode === "mm" ? state.mmBookId : state.paliBookId,
                        page: state.readerMode === "mm" ? state.mmPage : state.paliPage,
                        bookName: state.readerMode === "mm" ? (state.mmBookName || "မြန်မာပြန်") : (state.paliBookName || "ပါဠိတော်")
                    };
                }
                if (bookId === state.swapOrigin.bookId) {
                    state.swapOrigin = null; // back home: clear the origin
                }
                if (state.readerMode === "mm") {
                    setReaderMode("pali");
                }
                await loadPaliBook(bookId, page);
                showScrollToast(`📖 ${card.querySelector(".edition-card-title")?.textContent || ''} သို့ ရောက်ရှိပါပြီ`);
            }
            updateReaderToolbarState();
        };
    });
}

async function loadSwitcherProgressiveData(curBookId, curPage, isMM) {
    const compContainer = document.getElementById("switcherCompanionsContainer");
    const mmCard = document.getElementById("switcherCardMM");
    const mmBadge = document.getElementById("switcherBadgeMM");
    const paliCard = document.getElementById("switcherCardPali");
    const paliBadge = document.getElementById("switcherBadgePali");
    const paliTitle = document.getElementById("switcherPaliTitle");

    let basePaliId = state.paliBookId;

    // A. Match Myanmar translation target page if currently in Pali
    if (!isMM && mmCard && mmBadge) {
        try {
            const res = await fetch(`/api/match/pali_to_companion?source_book=${encodeURIComponent(state.paliBookId)}&source_page=${state.paliPage}&target_type=mm`);
            if (res.ok) {
                const match = await res.json();
                if (match && match.target_book) {
                    mmCard.setAttribute("data-book", match.target_book);
                    mmCard.setAttribute("data-page", match.target_page || 1);
                    mmBadge.textContent = `စာ-${toMyanmarNum(match.target_page || 1)} သို့`;
                }
            }
        } catch (_) {}
    }

    // B. Match Pali Mula target page if currently in Myanmar
    if (isMM && paliCard && paliBadge) {
        try {
            const res = await fetch(`/api/match/pali_to_companion?source_book=${encodeURIComponent(state.mmBookId)}&source_page=${state.mmPage}&target_type=pali`);
            if (res.ok) {
                const match = await res.json();
                if (match && match.target_book) {
                    basePaliId = match.target_book;
                    paliCard.setAttribute("data-book", match.target_book);
                    paliCard.setAttribute("data-page", match.target_page || 1);
                    paliBadge.textContent = `စာ-${toMyanmarNum(match.target_page || 1)} သို့ ↩`;
                }
            }
        } catch (_) {}
    }

    // B2. Match the Mūla page while the reader sits inside a commentary volume
    // (Aṭṭhakathā/Ṭīkā). Without this the card only ever offered commentary
    // page 1, so "return to Pali" lost the reader's place.
    if (!isMM && paliCard) {
        const paliTargetId = paliCard.getAttribute("data-book");
        if (paliTargetId && paliTargetId !== curBookId) {
            try {
                const res = await fetch(`/api/match/pali_to_companion?source_book=${encodeURIComponent(curBookId)}&source_page=${curPage}&target_type=pali&target_book=${encodeURIComponent(paliTargetId)}`);
                if (res.ok) {
                    const match = await res.json();
                    if (match && match.target_book) {
                        paliCard.setAttribute("data-book", match.target_book);
                        paliCard.setAttribute("data-page", match.target_page || 1);
                        if (paliBadge) paliBadge.textContent = `စာ-${toMyanmarNum(match.target_page || 1)} သို့ ↩`;
                    }
                }
            } catch (_) {}
        }
    }

    // C. Fetch Atthakatha and Tika companions
    const paliId = isMM ? (basePaliId || state.swapOrigin?.bookId || "mula_vi_01") : state.paliBookId;
    if (!paliId || !compContainer) return;

    try {
        const res = await fetch(`/api/pali/companions/${encodeURIComponent(paliId)}`);
        if (!res.ok) return;
        const comp = await res.json();
        state.companionData = comp;

        // Keep the Mūla card title honest when step B/B2 re-resolved the target
        // (the synchronous render may have shown another book's name).
        if (paliCard && paliTitle && comp && comp.current && comp.current.id === paliCard.getAttribute("data-book")) {
            paliTitle.textContent = comp.current.name;
        }

        let compHtml = "";
        const curActiveBook = isMM ? state.mmBookId : state.paliBookId;

        // Group label — makes it obvious these are the editions related to the
        // page the reader is on right now (not a generic book list).
        const hasCompanionBooks = !!(comp.attha && comp.attha.length) || !!(comp.tika && comp.tika.length);
        if (hasCompanionBooks) {
            compHtml += `<div class="edition-switcher-section-label">📚 ဤစာမျက်နှာနှင့် တွဲဖက်ကျမ်းများ</div>`;
        }

        // Atthakatha
        if (comp.attha && comp.attha.length > 0) {
            comp.attha.forEach(b => {
                const isActive = (curActiveBook === b.id);
                compHtml += `
                    <div class="edition-switcher-card ${isActive ? 'active-edition' : ''}" data-type="pali" data-book="${b.id}" data-page="1">
                        <div class="edition-card-left">
                            <span class="edition-card-icon">📖</span>
                            <div class="edition-card-texts">
                                <span class="edition-card-title">${escapeHtml(b.name)}</span>
                                <span class="edition-card-desc">အဋ္ဌကထာ တွဲဖက်ကျမ်း</span>
                            </div>
                        </div>
                        <span class="edition-card-badge ${isActive ? 'badge-active' : 'badge-jump'}" data-match-book="${b.id}">
                            ${isActive ? '✓ ဖတ်ရှုနေဆဲ' : 'ကူးပြောင်းမည်'}
                        </span>
                    </div>
                `;
            });
        }

        // Tika
        if (comp.tika && comp.tika.length > 0) {
            comp.tika.forEach(b => {
                const isActive = (curActiveBook === b.id);
                compHtml += `
                    <div class="edition-switcher-card ${isActive ? 'active-edition' : ''}" data-type="pali" data-book="${b.id}" data-page="1">
                        <div class="edition-card-left">
                            <span class="edition-card-icon">📜</span>
                            <div class="edition-card-texts">
                                <span class="edition-card-title">${escapeHtml(b.name)}</span>
                                <span class="edition-card-desc">ဋီကာ တွဲဖက်ကျမ်း</span>
                            </div>
                        </div>
                        <span class="edition-card-badge ${isActive ? 'badge-active' : 'badge-jump'}" data-match-book="${b.id}">
                            ${isActive ? '✓ ဖတ်ရှုနေဆဲ' : 'ကူးပြောင်းမည်'}
                        </span>
                    </div>
                `;
            });
        }

        compContainer.innerHTML = compHtml;
        attachSwitcherItemHandlers();

        // D. Resolve exact target pages for companions
        const allItems = compContainer.querySelectorAll(".edition-switcher-card");
        const srcBook = isMM ? state.mmBookId : state.paliBookId;
        const srcPage = isMM ? (state.mmPage || 1) : (state.paliPage || 1);

        allItems.forEach(async item => {
            const targetBook = item.getAttribute("data-book");
            if (targetBook === curActiveBook) return;
            try {
                const mUrl = `/api/match/pali_to_companion?source_book=${encodeURIComponent(srcBook)}&source_page=${srcPage}&target_type=pali&target_book=${encodeURIComponent(targetBook)}`;
                const mRes = await fetch(mUrl);
                if (mRes.ok) {
                    const mData = await mRes.json();
                    if (mData && mData.target_page) {
                        item.setAttribute("data-page", mData.target_page);
                        const badge = item.querySelector(`[data-match-book="${targetBook}"]`);
                        if (badge && !item.classList.contains("active-edition")) {
                            badge.textContent = `စာ-${toMyanmarNum(mData.target_page)} သို့`;
                        }
                    }
                }
            } catch (_) {}
        });
    } catch (_) {}
}

function closeEditionSwitcher() {
    if (!el.editionSwitcherBackdrop) return;
    el.editionSwitcherBackdrop.classList.remove("active");
    setTimeout(() => {
        if (!el.editionSwitcherBackdrop.classList.contains("active")) {
            el.editionSwitcherBackdrop.style.display = "none";
        }
    }, 220);
    state.isEditionSwitcherOpen = false;
}

// ------------------------------------------------------------
// Reader More Sheet ("အခြား") Modal
// ------------------------------------------------------------
function openReaderMoreSheet() {
    if (!el.readerMoreBackdrop) return;

    // Sync quick settings state
    if (el.moreFontDisplay) {
        el.moreFontDisplay.textContent = `${state.fontSize}%`;
    }
    if (el.moreNotesStateText) {
        el.moreNotesStateText.textContent = state.showNotes ? "အောက်ခြေမှတ်စု ဝှက်မည်" : "အောက်ခြေမှတ်စု ပြမည်";
    }
    updateNissayaToggleLabel();
    document.querySelectorAll(".qs-theme-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-theme") === state.theme);
    });

    el.readerMoreBackdrop.style.display = "flex";
    requestAnimationFrame(() => {
        el.readerMoreBackdrop.classList.add("active");
    });
    state.isReaderMoreOpen = true;
}

function closeReaderMoreSheet() {
    if (!el.readerMoreBackdrop) return;
    el.readerMoreBackdrop.classList.remove("active");
    setTimeout(() => {
        if (!el.readerMoreBackdrop.classList.contains("active")) {
            el.readerMoreBackdrop.style.display = "none";
        }
    }, 220);
    state.isReaderMoreOpen = false;
}

// ------------------------------------------------------------
// Scroll-Based Auto-Hiding Chrome
// ------------------------------------------------------------
let _lastScrollY = 0;

function setupScrollAutoHiding() {
    const handleScroll = () => {
        if (window.innerWidth > 768 || state.appView !== "reader") {
            document.body.classList.remove("chrome-hidden");
            return;
        }

        // Suppress auto-hiding when any modal/sheet/drawer is active
        const isSheetOpen = state.isEditionSwitcherOpen ||
                            state.isReaderMoreOpen ||
                            document.querySelector(".dict-drawer.open, .sidebar.open, .edition-switcher-backdrop.active, .reader-more-backdrop.active, .modal.show");
        if (isSheetOpen) {
            document.body.classList.remove("chrome-hidden");
            return;
        }

        const scrollContainer = document.querySelector(".reader-container") || window;
        const scrollY = (scrollContainer === window) ? window.scrollY : scrollContainer.scrollTop;
        const delta = scrollY - _lastScrollY;

        // 10px threshold to prevent jitter
        if (Math.abs(delta) < 10) return;

        // Near top of page: always show
        if (scrollY < 60) {
            document.body.classList.remove("chrome-hidden");
            _lastScrollY = scrollY;
            return;
        }

        if (delta > 0) {
            // Scrolling down -> hide chrome for pure reading focus
            document.body.classList.add("chrome-hidden");
        } else {
            // Scrolling up -> reveal chrome
            document.body.classList.remove("chrome-hidden");
        }

        _lastScrollY = scrollY;
    };

    const container = document.querySelector(".reader-container");
    if (container) {
        container.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });
}

// Copy Current Page / Selected Text
async function copyCurrentPageText() {
    closeReaderMoreSheet();
    let text = "";
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
        text = sel.toString().trim();
    } else if (el.paliContent) {
        const clone = el.paliContent.cloneNode(true);
        clone.querySelectorAll(".note, .hangnum, .page-divider").forEach(node => node.remove());
        text = clone.innerText.trim();
    }

    if (!text) {
        showScrollToast("ကူးယူရန် စာသား မရှိပါ");
        return;
    }

    let success = false;
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            success = true;
        } catch (e) {
            console.warn("clipboard writeText failed:", e);
        }
    }
    if (!success) {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try {
            document.execCommand("copy");
            success = true;
        } catch (e) {}
        document.body.removeChild(ta);
    }

    if (success) {
        showScrollToast("📋 စာမျက်နှာ စာသားများကို ကော်ပီကူးယူပြီးပါပြီ");
    } else {
        showScrollToast("စာသား ကူးယူမှု မအောင်မြင်ပါ");
    }
}

function getLoadedFeedPages() {
    const isMM = (state.readerMode === "mm");
    const prefix = isMM ? "mm-page-" : "pali-page-";
    const items = el.paliContent.querySelectorAll(`.feed-page-item[id^="${prefix}"]`);
    const pages = [];
    items.forEach(it => {
        const p = parseInt(it.getAttribute("data-page"), 10);
        if (!isNaN(p)) pages.push(p);
    });
    return pages.sort((a, b) => a - b);
}

// Feed-mode DOM windowing: keep only pages within ±FEED_WINDOW_RADIUS of the
// current page. Without this, scrolling a long book end-to-end leaves hundreds
// of sections in the DOM (memory + slow layout on mobile). Pruned pages reload
// on demand through the existing infinite-scroll machinery (handleLoadPrevPage
// / loadNextFeedPage detect the missing section by id and fetch it).
const FEED_WINDOW_RADIUS = 5;
function pruneFeedDOM() {
    if (state.scrollMode !== "feed" || !el.paliContent || !el.readerContainer) return;
    const isMM = (state.readerMode === "mm");
    const prefix = isMM ? "mm-page-" : "pali-page-";
    const cur = isMM ? state.mmPage : state.paliPage;
    const minKeep = cur - FEED_WINDOW_RADIUS;
    const maxKeep = cur + FEED_WINDOW_RADIUS;

    // Collect first, remove after: avoids forced synchronous layouts
    // (offsetHeight reads) inside the loop which caused UI hangs.
    const toRemove = [];
    el.paliContent.querySelectorAll(`.feed-page-item[id^="${prefix}"]`).forEach(sec => {
        const p = parseInt(sec.getAttribute("data-page"), 10);
        if (isNaN(p) || (p >= minKeep && p <= maxKeep)) return;

        // Remove the section's divider too: append-mode puts the divider right
        // before the section (same data-page); prepend-mode puts it right after.
        const prev = sec.previousElementSibling;
        if (prev && prev.classList.contains("page-divider") &&
            prev.getAttribute("data-page") === sec.getAttribute("data-page")) {
            toRemove.push(prev);
        } else {
            const next = sec.nextElementSibling;
            if (next && next.classList.contains("page-divider")) {
                toRemove.push(next);
            }
        }
        if (pageVisibilityObserver) pageVisibilityObserver.unobserve(sec);
        toRemove.push(sec);
    });
    // Single batch removal: one layout invalidation instead of N forced ones.
    // Scroll position may shift slightly; the feed re-stabilizes on next scroll.
    // This is acceptable vs. the hang caused by offsetHeight reads.
    // v7.43: drop the badge jump row only when its own divider is pruned —
    // an unconditional removal here killed open rows on unrelated scroll prunes
    // while the user was about to type.
    const badgeRow = document.getElementById("jumpBadgeRow");
    if (badgeRow) {
        const anchor = badgeRow.previousElementSibling;
        if (anchor && toRemove.includes(anchor)) badgeRow.remove();
    }
    for (const elm of toRemove) elm.remove();
    // Keep state.feedLoadedPages in sync with the DOM window: pruned pages are
    // no longer "loaded", so the Set stays truthful for state consumers.
    if (state.feedLoadedPages instanceof Set) {
        state.feedLoadedPages.forEach(p => {
            if (p < minKeep || p > maxKeep) state.feedLoadedPages.delete(p);
        });
    }
}

// ----------------- Pali Reader -----------------

async function loadPaliBook(bookId, targetPage = null) {
    state.feedSessionId = (state.feedSessionId || 0) + 1;
    const thisSession = state.feedSessionId;

    if (state.paliBookId !== bookId || state.paliTocs.length === 0) {
        state.paliBookId = bookId;
        try {
            const res = await fetch(`/api/book/${bookId}`);
            if (thisSession !== state.feedSessionId) return;
            if (!res.ok) throw new Error(`Book load failed (HTTP ${res.status})`);
            const data = await res.json();
            state.paliBookName = data.book.name;
            state.paliFirstPage = data.book.firstpage;
            state.paliLastPage = data.book.lastpage;
            state.paliTocs = data.tocs || [];
            state.paliSuttas = data.suttas || [];
            state.paliRelated = data.related || [];
            state.companionData = data.companions || null;
            
            if (el.tocFilterInput) el.tocFilterInput.value = "";
            renderTOC();
            renderSuttas();
            renderRelatedDropdown();
            updateOriginalImageBtn();
            highlightActiveBookInSidebar();
            if (state.appView === "reader" && window.innerWidth > 992) {
                switchToSidebarTab("tab-toc");
            }
        } catch (err) {
            console.error("Failed to load pali book metadata:", err);
        }
    }
    if (thisSession !== state.feedSessionId) return;

    let page = parseInt(targetPage, 10);
    if (isNaN(page) || (state.paliFirstPage && page < state.paliFirstPage) || (state.paliLastPage && page > state.paliLastPage)) {
        page = state.paliFirstPage || 1;
    }

    state.feedLoadedPages.clear();
    state.feedFirstLoadedPage = page;
    state.feedLastLoadedPage = page;

    await loadPaliPage(bookId, page);
}

function cleanPeyala(html) {
    if (!html) return "";
    // ဆဋ္ဌမူစာအုပ် မူရင်းအတိုင်း အရင်စာပိုဒ်နှင့်တူသော အကျဉ်းချုံး ပေယျာလနေရာများ (...ပ..., ...ပေ..., …ပ…, …ပေ…) ကို "။ ပ ။" သို့ ပြောင်းလဲခြင်း
    return html.replace(/([^\s\.\…<]?)\s*(?:…|\.{2,})\s*(?:ပေ|ပ)\s*(?:…|\.{2,})\s*[၊။]?/g, (match, prefix) => {
        if (prefix === '။' || prefix === '၊') {
            return `${prefix} ။ ပ ။ `;
        } else if (prefix) {
            return `${prefix}။ ပ ။ `;
        } else {
            return `။ ပ ။ `;
        }
    }).replace(/[ \t]{2,}/g, " ");
}

function insertPaliWbr(word) {
    if (!word || word.length < 8) return word;
    const chars = Array.from(word);
    const n = chars.length;
    const result = [];
    let lastBreak = 0;
    for (let i = 0; i < n - 1; i++) {
        result.push(chars[i]);
        const c = chars[i];
        const nextC = chars[i + 1];
        if (i < 2 || (n - i - 1) < 3) continue;
        if ((i - lastBreak) < 3) continue;
        // Next character must be an independent consonant or vowel
        if (nextC < '\u1000' || nextC > '\u102A') continue;
        // Next character must NOT be followed by virama (stacked consonant cannot start a line)
        if (i + 2 < n && chars[i + 2] === '\u1039') continue;
        // Next character must NOT be start of Kinzi (င်္ = \u1004\u103A\u1039)
        if (nextC === '\u1004' && i + 3 < n && chars[i + 2] === '\u103A' && chars[i + 3] === '\u1039') continue;
        // Current character must be a valid syllable end (vowel sign, asat, tone, or inherent-vowel consonant)
        if (/[\u102B-\u1032\u1036-\u1038\u103A]/.test(c)) {
            result.push('<wbr>');
            lastBreak = i;
        } else if (c >= '\u1000' && c <= '\u1021') {
            result.push('<wbr>');
            lastBreak = i;
        }
    }
    result.push(chars[n - 1]);
    return result.join("");
}

function protectPaliWords(html) {
    if (!html) return "";
    // Clean any prior spans and wbr to be idempotent
    const unspanned = html
        .replace(/<span class="pali-word">([\s\S]*?)<\/span>/g, "$1")
        .replace(/<span class="no-split">([\s\S]*?)<\/span>/g, "$1")
        .replace(/<wbr>/g, "");
        
    const parts = unspanned.split(/(<[^>]+>)/g);
    const symRegex = /^[\s\d၀-၉၊။,.\-—–“’”"'()\[\]<>:;?!/\\#*~`]+$/;
    const conjunctRegex = /([\u1000-\u1021\u1004\u103a]\u1039[\u1000-\u1021])/g;
    
    return parts.map(part => {
        if (!part || part.startsWith("<")) return part;
        return part.replace(/\S+/g, (w) => {
            if (symRegex.test(w)) return w;
            const wbrW = insertPaliWbr(w);
            const protectedW = wbrW.replace(conjunctRegex, '<span class="no-split">$1</span>');
            return `<span class="pali-word">${protectedW}</span>`;
        });
    }).join("");
}

function protectMyanmarConjuncts(html) {
    if (!html) return "";
    const unspanned = html.replace(/<span class="no-split">([\s\S]*?)<\/span>/g, "$1");
    const parts = unspanned.split(/(<[^>]+>)/g);
    return parts.map(part => {
        if (!part || part.startsWith("<")) return part;
        return part.replace(/([\u1000-\u1021\u1004\u103a]\u1039[\u1000-\u1021])/g, '<span class="no-split">$1</span>');
    }).join("");
}

function cleanGathaQuotes(text) {
    if (!text) return "";
    // 1. Opening quote at start of line / after leading HTML tags (anchor, span, etc.)
    let res = text.replace(/(^|^(?:<a\b[^>]*>.*?<\/a>|<span\b[^>]*>.*?<\/span>|\s)*)[\u201c\u201d\u2018\u2019"']+\s*/g, "$1");
    // 2. Closing quote before quotative endings 'တိ' or 'န္တိ' (iti)
    res = res.replace(/[\u201c\u201d\u2018\u2019"']+(?=(?:န္တိ|တိ)[၊။]?)/g, "");
    // 3. Quote before comma, section mark, or end of pada / tag
    res = res.replace(/[\u201c\u201d\u2018\u2019"']+(?=[,၊။]|\s*(?:<|$))/g, "");
    // 4. Quote immediately after punctuation (e.g. ။” -> ။ or ၊” -> ၊)
    res = res.replace(/([၊။])[\u201c\u201d\u2018\u2019"']+/g, "$1");
    return res;
}

const PALI_VOCATIVES_BEFORE_RE = /[၊,]\s*((?:<[^>]+>)*\s*)(ဘိက္ခဝေ|ဘိက္ခဝေါ|ဘန္တေ|အာဝုသော|မဟာရာဇ|မဟာရာဇာ|အာနန္ဒ|ဗြာဟ္မဏ|တာတ|ဒေဝ|သာရိပုတ္တ|မောဂ္ဂလ္လာန|ကဿပ|ဥပါလိ|သုဘဒ္ဒ|ဂေါတမ)(?=[<၊။,\s”’"\'\)\]}}]|$)/g;
const PALI_VOCATIVES_AFTER_RE = /(ဘိက္ခဝေ|ဘိက္ခဝေါ|ဘန္တေ|အာဝုသော|မဟာရာဇ|မဟာရာဇာ|အာနန္ဒ|ဗြာဟ္မဏ|တာတ|ဒေဝ|သာရိပုတ္တ|မောဂ္ဂလ္လာန|ကဿပ|ဥပါလိ|သုဘဒ္ဒ|ဂေါတမ)((?:<[^>]+>)*)\s*[၊,]/g;
const PALI_PARTICLES_RE = /(^|[\s"\'“‘\(])(န|နော|မာ|စ|ဝါ|ဟိ|တု|ပန|ခေါ|ဝတ|ဟန္ဒ)((?:<[^>]+>)*)\s*[၊,]/g;

function cleanPaliContent(html) {
    if (!html) return "";
    try {
        // ပေယျာလ အကျဉ်းချုံးများကို ဆဋ္ဌမူစာအုပ်အတိုင်း "။ ပ ။" အဖြစ် အရင်ပြောင်းလဲပါမည်
        const peyalaCleaned = cleanPeyala(html);

        const formatted = peyalaCleaned.replace(/<p\b([^>]*)>([\s\S]*?)<\/p>/gi, (match, attrs, content) => {
            // ဂါထာပါဠိတော်များ (Gāthā) စာပိုဒ်များဖြစ်ပါက ဆဋ္ဌမူစာအုပ် မူရင်းပုံစံအတိုင်း:
            // ပထမ နှင့် တတိယ ပုဒ်အဆုံးတွင် ပုဒ်ထီး "၊" သုံးသည်
            // ဒုတိယ နှင့် စတုတ္ထ ပုဒ်အဆုံးတွင် ပုဒ်မ "။" သုံးသည်
            if (/\bclass\s*=\s*["'][^"']*gatha[^"']*["']/i.test(attrs)) {
                const clsMatch = attrs.match(/\bclass\s*=\s*["']([^"']+)["']/i);
                const clsName = clsMatch ? clsMatch[1].toLowerCase() : "";
                
                // If already wrapped in gatha-pada, preserve
                if (content.includes('<span class="gatha-pada')) {
                    return `<p${attrs}>${content}</p>`;
                }

                // ၁။ ဂါထာစာကြောင်း အစရှိ မလိုအပ်သော space များကို ဖယ်ရှား၍ ညီညာစေပါမည်
                content = content.replace(/^\s+/, "");
                content = content.replace(/^((?:<a\b[^>]*>.*?<\/a>)*)\s+/, "$1");
                // ဆဋ္ဌမူစာအုပ် မူရင်းအတိုင်း ဂါထာအစ/အဆုံး quotation marks (‘‘, ’’, “, ”) များကို သန့်စင်ဖယ်ရှားပါမည်
                content = cleanGathaQuotes(content);

                // ၂။ အပုဒ်များ ခွဲခြားထားသော comma ပါဝင်ပါက တစ်ပါဒစီ ခွဲခြား wrap လုပ်ပါမည်
                if (/,+(?![^<]*>)/.test(content)) {
                    const parts = content.split(/,(?![^<]*>)\s*/);
                    const padas = parts.map((part, i) => {
                        let p = cleanGathaQuotes(part.trim());
                        if (i < parts.length - 1) {
                            p = p.replace(/[၊။]([’"”’'\s]*(?:<[^>]+>[’"”’'\s]*)*)$/, "၊$1");
                            if (!/[၊]([’"”’'\s]*(?:<[^>]+>[’"”’'\s]*)*)$/.test(p)) {
                                p = p + "၊";
                            }
                        } else {
                            p = p.replace(/[၊]([’"”’'\s]*(?:<[^>]+>[’"”’'\s]*)*)$/, "။$1");
                            if (!/[။]([’"”’'\s]*(?:<[^>]+>[’"”’'\s]*)*)$/.test(p)) {
                                p = p + "။";
                            }
                        }
                        p = cleanGathaQuotes(p);
                        return `<span class="gatha-pada pada${i + 1}">${p}</span>`;
                    });
                    return `<p${attrs}>${padas.join(" ")}</p>`;
                } else {
                    let p = cleanGathaQuotes(content.trim());
                    if (clsName.includes("gatha2") || clsName.includes("gatha4") || clsName.includes("gathalast")) {
                        p = p.replace(/၊([’"”’'\s]*(?:<[^>]+>[’"”’'\s]*)*)$/, "။$1");
                    }
                    p = cleanGathaQuotes(p);
                    return `<p${attrs}><span class="gatha-pada">${p}</span></p>`;
                }
            }
            
            // စကားပြေ (Prose / Bodytext) တွင် မူရင်း English comma, semicolon များကို ပုဒ်ထီး (၊) သို့လည်းကောင်း၊ ? နှင့် ! များကို ပုဒ်မ (။) သို့လည်းကောင်း ပြောင်းလဲပြီးနောက်၊
            // ဆဋ္ဌသံဂါယနာ မူရင်းစာအုပ်စံနှုန်းအတိုင်း အာလပနများနှင့် နိပါတ်ပုဒ်ငယ်များရှိ Western comma အပိုများကို သန့်စင်ပါမည်
            let cleaned = content
                .replace(/,(?![^<]*>)/g, "၊")
                .replace(/;(?![^<]*>)/g, "၊")
                .replace(/[?!](?![^<]*>)/g, "။")
                .replace(PALI_VOCATIVES_BEFORE_RE, " $1$2")
                .replace(PALI_VOCATIVES_AFTER_RE, "$1$2 ")
                .replace(PALI_PARTICLES_RE, "$1$2$3 ")
                .replace(/၊\s*၊/g, "၊")
                .replace(/၊\s*။/g, "။")
                .replace(/။\s*။/g, "။")
                .replace(/[ \t]{2,}/g, " ");
            return `<p${attrs}>${cleaned}</p>`;
        });

        // ၅။ စာကြောင်းအကူးအပြောင်းတွင် စာလုံးဆင့်များ ပြတ်တောက်၍ (+) မဖြစ်ပေါ်စေရန် ပါဠိစာလုံးများကို wrap ပြုလုပ်ပါမည်
        return protectPaliWords(formatted);
    } catch (e) {
        console.warn("cleanPaliContent err:", e);
        return html;
    }
}

function cleanMMContent(html) {
    if (!html) return "";
    try {
        let res = cleanPeyala(html);
        res = res.replace(/။\s*ပ\s*။/g, "။ ပ ။ ").replace(/[ \t]{2,}/g, " ");
        return protectMyanmarConjuncts(res);
    } catch (e) {
        console.warn("cleanMMContent err:", e);
        return html;
    }
}

/* ============================================================
   Search Match Highlight & Text-Node Walker
   ============================================================ */
function highlightSearchTermsInContainer(container, query) {
    if (!container || !query) return 0;
    const tokens = query.trim().split(/\s+/).filter(t => t.length > 0);
    if (tokens.length === 0) return 0;

    const escapedQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedTokens = tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedQuery}|${escapedTokens.join('|')})`, 'gi');

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
        if (node.parentElement && (
            node.parentElement.tagName === 'SCRIPT' || 
            node.parentElement.tagName === 'STYLE' || 
            node.parentElement.classList.contains('search-match-highlight') ||
            node.parentElement.classList.contains('paranum')
        )) {
            continue;
        }
        // /g/ regex keeps lastIndex state between .test() calls: reset before
        // each test so a previous match never causes this node to be skipped.
        regex.lastIndex = 0;
        if (regex.test(node.nodeValue)) {
            textNodes.push(node);
        }
    }

    let matchCount = 0;
    for (const textNode of textNodes) {
        const parent = textNode.parentNode;
        if (!parent) continue;
        const text = textNode.nodeValue;
        regex.lastIndex = 0;

        const fragment = document.createDocumentFragment();
        let lastIdx = 0;
        let match;
        while ((match = regex.exec(text)) !== null) {
            if (match.index > lastIdx) {
                fragment.appendChild(document.createTextNode(text.substring(lastIdx, match.index)));
            }
            const mark = document.createElement('mark');
            mark.className = 'search-match-highlight';
            mark.textContent = match[0];
            fragment.appendChild(mark);
            matchCount++;
            lastIdx = regex.lastIndex;
        }
        if (lastIdx < text.length) {
            fragment.appendChild(document.createTextNode(text.substring(lastIdx)));
        }
        parent.replaceChild(fragment, textNode);
    }
    return matchCount;
}

function clearSearchHighlights(container) {
    if (!container) return;
    const marks = container.querySelectorAll('mark.search-match-highlight');
    marks.forEach(mark => {
        const text = mark.textContent;
        const parent = mark.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(text), mark);
            parent.normalize();
        }
    });
}

function clearPendingSearch() {
    state.pendingSearchHighlight = null;
    clearSearchHighlights(el.paliContent);
    if (el.splitPaliContent) clearSearchHighlights(el.splitPaliContent);
    if (el.splitRightContent) clearSearchHighlights(el.splitRightContent);
    if (el.splitMMContent && el.splitMMContent !== el.splitRightContent) clearSearchHighlights(el.splitMMContent);
}

function applyPendingSearchHighlight(container) {
    if (!state.pendingSearchHighlight || !container) return;
    const hitCount = highlightSearchTermsInContainer(container, state.pendingSearchHighlight);
    if (hitCount > 0) {
        const firstHit = container.querySelector("mark.search-match-highlight");
        if (firstHit) {
            setTimeout(() => {
                firstHit.scrollIntoView({ behavior: "smooth", block: "center" });
            }, 120);
        }
    }
}

async function loadPaliPage(bookId, pageNum = null, highlightWord = null, isAppend = false, isPrepend = false) {
    state.paliBookId = bookId;
    let targetNum = parseInt(pageNum, 10);
    if (isNaN(targetNum)) {
        targetNum = state.paliFirstPage || 1;
    }
    if (!isAppend && !isPrepend && state.paliFirstPage && state.paliLastPage) {
        if (targetNum < state.paliFirstPage) targetNum = state.paliFirstPage;
        if (targetNum > state.paliLastPage) targetNum = state.paliLastPage;
    }
    
    let thisSession = state.feedSessionId;
    if (!isAppend && !isPrepend) {
        state.feedSessionId = (state.feedSessionId || 0) + 1;
        thisSession = state.feedSessionId;
        state.feedLoadedPages.clear();
        state.feedFirstLoadedPage = targetNum;
        state.feedLastLoadedPage = targetNum;

        if (state.readerMode !== "split") {
            el.paliContent.innerHTML = `<div class="loading-state">စာမျက်နှာ ဖွင့်လှစ်နေပါသည်...</div>`;
            el.pageNumberInput.value = toMyanmarNum(targetNum);
            if (el.loadPrevBox) el.loadPrevBox.style.display = "none";
            if (el.infiniteSentinel) el.infiniteSentinel.style.display = "none";
        }
    }
    
    try {
        const pageUrl = `/api/page/${bookId}/${targetNum}` + ((isAppend || isPrepend) ? "?light=1" : "");
        const res = await fetch(pageUrl);
        if (thisSession !== state.feedSessionId) return;
        if (!res.ok) throw new Error(`Page load failed (HTTP ${res.status})`);
        const data = await res.json();

        state.paliFirstPage = data.first_page;
        state.paliLastPage = data.last_page;
        // Appends/prepends load with ?light=1, which omits matching_mm —
        // never let that overwrite the cross-link target from the full load.
        if (!isAppend && !isPrepend) state.matchingMM = data.matching_mm;
        const actualPage = data.page;

        // Prefetch the next page (page-speed fix A): warm the browser +
        // edge cache before the user scrolls, so the next append usually
        // hits cache instead of paying a ~5s origin round-trip. Same
        // light-ness as this load, so the cached entry matches what the
        // next load asks for. Low priority and best-effort — never delays
        // this render.
        try {
            if (data.next_page) {
                const nextUrl = `/api/page/${bookId}/${data.next_page}` + ((isAppend || isPrepend) ? "?light=1" : "");
                fetch(nextUrl, { priority: "low" }).then(function (r) { return r.arrayBuffer(); }).catch(function () {});
            }
        } catch (e) { /* prefetch is best-effort */ }
        
        if (_isPaliReaderMode()) {
            let html = cleanPaliContent(data.content);
            if (highlightWord) {
                // Escape regex metacharacters: raw user text like "(" or "+"
                // would throw a SyntaxError and abort the whole render.
                const safeWord = highlightWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
                const regex = new RegExp(`(${safeWord})`, "gi");
                html = html.replace(regex, `<mark class="hit">$1</mark>`);
            }

            if (state.scrollMode === "feed") {
                if (!isAppend && !isPrepend) {
                    state.paliPage = actualPage;
                    state.feedLoadedPages.clear();
                    state.feedLoadedPages.add(actualPage);
                    state.feedFirstLoadedPage = actualPage;
                    state.feedLastLoadedPage = actualPage;

                    el.bookTitleDisplay.textContent = withVolumeLabel(state.paliBookId, data.book_name);
                    el.chapterTitleDisplay.textContent = data.chapter_name || "";
                    el.totalPageDisplay.textContent = toMyanmarNum(data.last_page);
                    el.metaBookName.textContent = data.book_name;
                    el.metaPageNum.textContent = toMyanmarNum(actualPage);
                    el.footerCurrentPage.textContent = toMyanmarNum(actualPage);
                    el.footerTotalPage.textContent = toMyanmarNum(data.last_page);
                    el.pageNumberInput.value = toMyanmarNum(actualPage);
                    el.pageNumberInput.min = data.first_page;
                    el.pageNumberInput.max = data.last_page;

                    el.btnPrevPage.disabled = !data.has_prev;
                    el.btnNextPage.disabled = !data.has_next;
                    el.btnFooterPrev.style.visibility = data.has_prev ? "visible" : "hidden";
                    el.btnFooterNext.style.visibility = data.has_next ? "visible" : "hidden";

                    el.paliContent.innerHTML = `
                        <section class="feed-page-item" id="pali-page-${actualPage}" data-page="${actualPage}">
                            ${html}
                        </section>
                    `;
                    el.readerContainer.scrollTop = 0;

                    if (el.loadPrevBox && el.loadPrevText) {
                        if (actualPage > data.first_page) {
                            el.loadPrevBox.style.display = "flex";
                            el.loadPrevText.textContent = `ယခင်စာမျက်နှာ (${toMyanmarNum(actualPage - 1)}) ကို ဆွဲယူရန်`;
                        } else {
                            el.loadPrevBox.style.display = "none";
                        }
                    }

                    if (el.infiniteSentinel) el.infiniteSentinel.style.display = "flex";
                    if (el.sentinelEnd) el.sentinelEnd.style.display = (actualPage >= data.last_page) ? "block" : "none";
                    if (el.sentinelLoading) el.sentinelLoading.style.display = "none";
                    if (el.pageScrollIndicator) el.pageScrollIndicator.style.display = "none";

                    try { setupSentinelObserver(); } catch (e) { console.warn("setupSentinelObserver err:", e); }
                    try { setupPageVisibilityObserver(); } catch (e) { console.warn("setupPageVisibilityObserver err:", e); }
                    try { debounceRecent(bookId, actualPage); } catch (e) { console.warn("debounceRecent err:", e); }
                    try { updateBookmarkIconStatus(); } catch (e) { console.warn("updateBookmarkIconStatus err:", e); }
                    try { highlightActiveToc(actualPage); } catch (e) { console.warn("highlightActiveToc err:", e); }
                    try { injectAnnotationPins(el.paliContent, bookId, actualPage); } catch (e) { console.warn("injectAnnotationPins err:", e); }
                    try { applyNissayaToCurrentPage(); } catch (e) { console.warn("applyNissaya err:", e); }
                    try { applyPendingSearchHighlight(el.paliContent); } catch (e) { console.warn("applyPendingSearchHighlight err:", e); }
                } else if (isAppend) {
                    const loaded = getLoadedFeedPages();
                    const currentLast = loaded.length > 0 ? loaded[loaded.length - 1] : (data.first_page - 1);
                    if (loaded.length > 0 && actualPage !== currentLast + 1) {
                        console.warn(`Prevented non-sequential append: expected ${currentLast + 1}, got ${actualPage}`);
                        return;
                    }
                    if (document.getElementById(`pali-page-${actualPage}`)) {
                        return;
                    }
                    state.feedLoadedPages.add(actualPage);
                    state.feedLastLoadedPage = actualPage;

                    const chName = getCurrentChapterName("pali", actualPage);
                    const chPart = chName ? `<span class="badge-chapter">${escapeHtml(chName)}</span><span class="badge-sep">•</span>` : "";

                    const div = document.createElement("div");
                    div.className = "page-divider";
                    div.setAttribute("data-page", actualPage);
                    div.innerHTML = `
                        <div class="divider-line"></div>
                        <div class="divider-badge">
                            <span class="badge-icon">📖</span>
                            ${chPart}
                            <span class="badge-text">စာမျက်နှာ ${toMyanmarNum(actualPage)}</span>
                        </div>
                        <div class="divider-line"></div>
                    `;

                    const sec = document.createElement("section");
                    sec.className = "feed-page-item";
                    sec.id = `pali-page-${actualPage}`;
                    sec.setAttribute("data-page", actualPage);
                    sec.innerHTML = html;

                    el.paliContent.appendChild(div);
                    el.paliContent.appendChild(sec);
                    try { injectAnnotationPins(sec, bookId, actualPage); } catch (e) { console.warn(e); }
                    try { applyNissayaToFeedSection(sec, bookId, actualPage); } catch (e) { console.warn(e); }

                    if (pageVisibilityObserver) {
                        try { pageVisibilityObserver.observe(sec); } catch (e) { console.warn(e); }
                    }

                    if (actualPage >= data.last_page) {
                        if (el.sentinelEnd) el.sentinelEnd.style.display = "block";
                        if (el.sentinelLoading) el.sentinelLoading.style.display = "none";
                    }
                } else if (isPrepend) {
                    const loaded = getLoadedFeedPages();
                    const currentFirst = loaded.length > 0 ? loaded[0] : (data.last_page + 1);
                    if (loaded.length > 0 && actualPage !== currentFirst - 1) {
                        console.warn(`Prevented non-sequential prepend: expected ${currentFirst - 1}, got ${actualPage}`);
                        return;
                    }
                    if (document.getElementById(`pali-page-${actualPage}`)) {
                        return;
                    }
                    state.feedLoadedPages.add(actualPage);
                    state.feedFirstLoadedPage = actualPage;

                    const chNamePre = getCurrentChapterName("pali", actualPage + 1);
                    const chPartPre = chNamePre ? `<span class="badge-chapter">${escapeHtml(chNamePre)}</span><span class="badge-sep">•</span>` : "";

                    const div = document.createElement("div");
                    div.className = "page-divider";
                    div.setAttribute("data-page", actualPage + 1);
                    div.innerHTML = `
                        <div class="divider-line"></div>
                        <div class="divider-badge">
                            <span class="badge-icon">📖</span>
                            ${chPartPre}
                            <span class="badge-text">စာမျက်နှာ ${toMyanmarNum(actualPage + 1)}</span>
                        </div>
                        <div class="divider-line"></div>
                    `;

                    const sec = document.createElement("section");
                    sec.className = "feed-page-item";
                    sec.id = `pali-page-${actualPage}`;
                    sec.setAttribute("data-page", actualPage);
                    sec.innerHTML = html;

                    const oldScrollHeight = el.readerContainer.scrollHeight;
                    const oldScrollTop = el.readerContainer.scrollTop;

                    el.paliContent.insertBefore(div, el.paliContent.firstChild);
                    el.paliContent.insertBefore(sec, div);
                    try { injectAnnotationPins(sec, bookId, actualPage); } catch (e) { console.warn(e); }
                    try { applyNissayaToFeedSection(sec, bookId, actualPage); } catch (e) { console.warn(e); }

                    const heightAdded = el.readerContainer.scrollHeight - oldScrollHeight;
                    el.readerContainer.scrollTop = oldScrollTop + heightAdded;

                    if (pageVisibilityObserver) {
                        try { pageVisibilityObserver.observe(sec); } catch (e) { console.warn(e); }
                    }

                    if (el.loadPrevBox && el.loadPrevText) {
                        if (actualPage > data.first_page) {
                            el.loadPrevBox.style.display = "flex";
                            el.loadPrevText.textContent = `ယခင်စာမျက်နှာ (${toMyanmarNum(actualPage - 1)}) ကို ဆွဲယူရန်`;
                        } else {
                            el.loadPrevBox.style.display = "none";
                        }
                    }
                }
            } else {
                // Single page mode
                state.paliPage = actualPage;
                el.bookTitleDisplay.textContent = withVolumeLabel(state.paliBookId, data.book_name);
                el.chapterTitleDisplay.textContent = data.chapter_name || "";
                el.totalPageDisplay.textContent = toMyanmarNum(data.last_page);
                el.metaBookName.textContent = data.book_name;
                el.metaPageNum.textContent = toMyanmarNum(actualPage);
                el.footerCurrentPage.textContent = toMyanmarNum(actualPage);
                el.footerTotalPage.textContent = toMyanmarNum(data.last_page);
                el.pageNumberInput.value = toMyanmarNum(actualPage);
                el.pageNumberInput.min = data.first_page;
                el.pageNumberInput.max = data.last_page;
                
                el.btnPrevPage.disabled = !data.has_prev;
                el.btnNextPage.disabled = !data.has_next;
                el.btnFooterPrev.style.visibility = data.has_prev ? "visible" : "hidden";
                el.btnFooterNext.style.visibility = data.has_next ? "visible" : "hidden";
                
                el.paliContent.innerHTML = html;
                el.readerContainer.scrollTop = 0;
                
                if (el.loadPrevBox) el.loadPrevBox.style.display = "none";
                if (el.infiniteSentinel) el.infiniteSentinel.style.display = "none";
                updateScrollIndicator(actualPage, data.last_page);
                
                try { debounceRecent(bookId, actualPage); } catch (e) { console.warn("debounceRecent err:", e); }
                try { updateBookmarkIconStatus(); } catch (e) { console.warn("updateBookmarkIconStatus err:", e); }
                try { highlightActiveToc(actualPage); } catch (e) { console.warn("highlightActiveToc err:", e); }
                try { injectAnnotationPins(el.paliContent, bookId, actualPage); } catch (e) { console.warn("injectAnnotationPins err:", e); }
                try { applyNissayaToCurrentPage(); } catch (e) { console.warn("applyNissaya err:", e); }
                try { applyPendingSearchHighlight(el.paliContent); } catch (e) { console.warn("applyPendingSearchHighlight err:", e); }
            }
        }

        // Update split view if open
        if (state.readerMode === "split") {
            state.paliPage = actualPage;
            state.paliBookName = data.book_name;
            if (el.splitPaliTitle) el.splitPaliTitle.textContent = data.book_name;
            if (el.splitPaliPageInput) {
                el.splitPaliPageInput.value = actualPage;
                el.splitPaliPageInput.min = data.first_page;
                el.splitPaliPageInput.max = data.last_page;
            }
            if (el.splitPaliTotalDisplay) el.splitPaliTotalDisplay.textContent = toMyanmarNum(data.last_page);
            if (el.btnSplitPaliPrev) el.btnSplitPaliPrev.disabled = !data.has_prev;
            if (el.btnSplitPaliNext) el.btnSplitPaliNext.disabled = !data.has_next;
            if (el.splitPaliContent) {
                el.splitPaliContent.innerHTML = cleanPaliContent(data.content);
                try { applyPendingSearchHighlight(el.splitPaliContent); } catch (e) { console.warn(e); }
                try { injectAnnotationPins(el.splitPaliContent, bookId, actualPage); } catch (e) { console.warn(e); }
                try { applyNissayaToCurrentPage(); } catch (e) { console.warn(e); }
            }
            
            // Sync matching Companion page (Attha, Tika, Mula, or MM)
            try {
                await syncSplitCompanionPane(bookId, actualPage);
                attachSplitViewParagraphListeners();
            } catch (e) {
                console.warn("syncSplitCompanionPane err:", e);
            }
        }

    } catch (err) {
        console.error("Failed to load pali page:", err);
        // Never leave the paper frozen on the loading text: show an error
        // with a retry ONLY if content hasn't been rendered yet.
        const hasContent = el.paliContent && el.paliContent.querySelector(".feed-page-item, p");
        if (!hasContent && !isAppend && !isPrepend && thisSession === state.feedSessionId &&
            state.readerMode !== "split" && el.paliContent) {
            el.paliContent.innerHTML = `
                <div class="page-error-state" style="padding:40px 16px;text-align:center;">
                    <p style="margin-bottom:14px;">စာမျက်နှာ ဆွဲယူရာတွင် အမှားတစ်ခု ဖြစ်ပွားပါသည်။</p>
                    <button class="tool-btn" onclick='loadPaliPage(${JSON.stringify(bookId)}, ${targetNum})'>ပြန်လည်ကြိုးစားရန်</button>
                </div>
            `;
        }
    }
}

// ----------------- Myanmar Translation Reader -----------------

async function loadMMBook(bookId, targetPage = null) {
    state.feedSessionId = (state.feedSessionId || 0) + 1;
    const thisSession = state.feedSessionId;

    if (state.mmBookId !== bookId || state.mmTocs.length === 0) {
        state.mmBookId = bookId;
        try {
            const res = await fetch(`/api/mm/book/${bookId}`);
            if (thisSession !== state.feedSessionId) return;
            if (!res.ok) throw new Error(`Book load failed (HTTP ${res.status})`);
            const data = await res.json();
            state.mmBookName = data.book.name;
            state.mmFirstPage = data.book.first_page;
            state.mmLastPage = data.book.last_page;
            state.mmTocs = data.tocs || [];
            state.mmSuttas = data.suttas || [];
            
            if (el.tocFilterInput) el.tocFilterInput.value = "";
            renderTOC();
            renderSuttas();
            highlightActiveBookInSidebar();
            if (state.appView === "reader" && window.innerWidth > 992) {
                switchToSidebarTab("tab-toc");
            }
        } catch (err) {
            console.error("Failed to load mm book metadata:", err);
        }
    }
    if (thisSession !== state.feedSessionId) return;

    let page = parseInt(targetPage, 10);
    if (isNaN(page) || (state.mmFirstPage && page < state.mmFirstPage) || (state.mmLastPage && page > state.mmLastPage)) {
        page = state.mmFirstPage || 1;
    }

    state.feedLoadedPages.clear();
    state.feedFirstLoadedPage = page;
    state.feedLastLoadedPage = page;

    await loadMMPage(bookId, page);
}

async function loadMMPage(bookId, pageNum = null, isSplitRightPane = false, isAppend = false, isPrepend = false) {
    state.mmBookId = bookId;
    let targetNum = parseInt(pageNum, 10);
    if (isNaN(targetNum)) {
        targetNum = state.mmFirstPage || 1;
    }
    if (!isSplitRightPane && !isAppend && !isPrepend && state.mmFirstPage && state.mmLastPage) {
        if (targetNum < state.mmFirstPage) targetNum = state.mmFirstPage;
        if (targetNum > state.mmLastPage) targetNum = state.mmLastPage;
    }

    let thisSession = state.feedSessionId;
    if (!isSplitRightPane && !isAppend && !isPrepend && state.readerMode === "mm") {
        state.feedSessionId = (state.feedSessionId || 0) + 1;
        thisSession = state.feedSessionId;
        state.feedLoadedPages.clear();
        state.feedFirstLoadedPage = targetNum;
        state.feedLastLoadedPage = targetNum;

        el.paliContent.innerHTML = `<div class="loading-state">မြန်မာပြန် စာမျက်နှာ ဖွင့်လှစ်နေပါသည်...</div>`;
        el.pageNumberInput.value = toMyanmarNum(targetNum);
        if (el.loadPrevBox) el.loadPrevBox.style.display = "none";
        if (el.infiniteSentinel) el.infiniteSentinel.style.display = "none";
    }

    try {
        const mmPageUrl = `/api/mm/page/${bookId}/${targetNum}` + ((isAppend || isPrepend) ? "?light=1" : "");
        const res = await fetch(mmPageUrl);
        if (thisSession !== state.feedSessionId) return;
        if (!res.ok) throw new Error(`Page load failed (HTTP ${res.status})`);
        const data = await res.json();
        if (data && data.content) data.content = cleanMMContent(data.content);

        state.mmFirstPage = data.first_page;
        state.mmLastPage = data.last_page;
        // Appends/prepends load with ?light=1, which omits matching_pali —
        // never let that overwrite the cross-link target from the full load.
        if (!isAppend && !isPrepend) state.matchingPali = data.matching_pali;
        const actualPage = data.page;

        // Prefetch the next page (page-speed fix A) — same reasoning as
        // loadPaliPage: warm the cache before the user scrolls.
        try {
            if (data.next_page) {
                const nextUrl = `/api/mm/page/${bookId}/${data.next_page}` + ((isAppend || isPrepend) ? "?light=1" : "");
                fetch(nextUrl, { priority: "low" }).then(function (r) { return r.arrayBuffer(); }).catch(function () {});
            }
        } catch (e) { /* prefetch is best-effort */ }

        if (state.readerMode === "mm" && !isSplitRightPane) {
            if (state.scrollMode === "feed") {
                if (!isAppend && !isPrepend) {
                    state.mmPage = actualPage;
                    state.feedLoadedPages.clear();
                    state.feedLoadedPages.add(actualPage);
                    state.feedFirstLoadedPage = actualPage;
                    state.feedLastLoadedPage = actualPage;

                    el.bookTitleDisplay.textContent = withVolumeLabel(state.mmBookId, data.book_name);
                    el.chapterTitleDisplay.textContent = data.chapter_name || "";
                    el.totalPageDisplay.textContent = toMyanmarNum(data.last_page);
                    el.metaBookName.textContent = data.book_name;
                    el.metaPageNum.textContent = toMyanmarNum(actualPage);
                    el.footerCurrentPage.textContent = toMyanmarNum(actualPage);
                    el.footerTotalPage.textContent = toMyanmarNum(data.last_page);
                    el.pageNumberInput.value = toMyanmarNum(actualPage);
                    el.pageNumberInput.min = data.first_page;
                    el.pageNumberInput.max = data.last_page;

                    el.btnPrevPage.disabled = !data.has_prev;
                    el.btnNextPage.disabled = !data.has_next;
                    el.btnFooterPrev.style.visibility = data.has_prev ? "visible" : "hidden";
                    el.btnFooterNext.style.visibility = data.has_next ? "visible" : "hidden";

                    el.paliContent.innerHTML = `
                        <section class="feed-page-item" id="mm-page-${actualPage}" data-page="${actualPage}">
                            ${data.content}
                        </section>
                    `;
                    el.readerContainer.scrollTop = 0;

                    if (el.loadPrevBox && el.loadPrevText) {
                        if (actualPage > data.first_page) {
                            el.loadPrevBox.style.display = "flex";
                            el.loadPrevText.textContent = `ယခင်စာမျက်နှာ (${toMyanmarNum(actualPage - 1)}) ကို ဆွဲယူရန်`;
                        } else {
                            el.loadPrevBox.style.display = "none";
                        }
                    }

                    if (el.infiniteSentinel) el.infiniteSentinel.style.display = "flex";
                    if (el.sentinelEnd) el.sentinelEnd.style.display = (actualPage >= data.last_page) ? "block" : "none";
                    if (el.sentinelLoading) el.sentinelLoading.style.display = "none";
                    if (el.pageScrollIndicator) el.pageScrollIndicator.style.display = "none";

                    try { setupSentinelObserver(); } catch (e) { console.warn(e); }
                    try { setupPageVisibilityObserver(); } catch (e) { console.warn(e); }
                    try { highlightActiveToc(actualPage); } catch (e) { console.warn(e); }
                    try { debounceRecent(bookId, actualPage); } catch (e) { console.warn(e); }
                    try { injectAnnotationPins(el.paliContent, bookId, actualPage); } catch (e) { console.warn(e); }
                    try { applyNissayaToCurrentPage(); } catch (e) { console.warn(e); }
                    try { applyPendingSearchHighlight(el.paliContent); } catch (e) { console.warn(e); }
                } else if (isAppend) {
                    const loaded = getLoadedFeedPages();
                    const currentLast = loaded.length > 0 ? loaded[loaded.length - 1] : (data.first_page - 1);
                    if (loaded.length > 0 && actualPage !== currentLast + 1) {
                        console.warn(`Prevented non-sequential append: expected ${currentLast + 1}, got ${actualPage}`);
                        return;
                    }
                    if (document.getElementById(`mm-page-${actualPage}`)) {
                        return;
                    }
                    state.feedLoadedPages.add(actualPage);
                    state.feedLastLoadedPage = actualPage;

                    const chName = getCurrentChapterName("mm", actualPage);
                    const chPart = chName ? `<span class="badge-chapter">${escapeHtml(chName)}</span><span class="badge-sep">•</span>` : "";

                    const div = document.createElement("div");
                    div.className = "page-divider";
                    div.setAttribute("data-page", actualPage);
                    div.innerHTML = `
                        <div class="divider-line"></div>
                        <div class="divider-badge">
                            <span class="badge-icon">📖</span>
                            ${chPart}
                            <span class="badge-text">စာမျက်နှာ ${toMyanmarNum(actualPage)}</span>
                        </div>
                        <div class="divider-line"></div>
                    `;

                    const sec = document.createElement("section");
                    sec.className = "feed-page-item";
                    sec.id = `mm-page-${actualPage}`;
                    sec.setAttribute("data-page", actualPage);
                    sec.innerHTML = data.content;

                    el.paliContent.appendChild(div);
                    el.paliContent.appendChild(sec);
                    try { injectAnnotationPins(sec, bookId, actualPage); } catch (e) { console.warn(e); }

                    if (pageVisibilityObserver) {
                        try { pageVisibilityObserver.observe(sec); } catch (e) { console.warn(e); }
                    }

                    if (actualPage >= data.last_page) {
                        if (el.sentinelEnd) el.sentinelEnd.style.display = "block";
                        if (el.sentinelLoading) el.sentinelLoading.style.display = "none";
                    }
                } else if (isPrepend) {
                    const loaded = getLoadedFeedPages();
                    const currentFirst = loaded.length > 0 ? loaded[0] : (data.last_page + 1);
                    if (loaded.length > 0 && actualPage !== currentFirst - 1) {
                        console.warn(`Prevented non-sequential prepend: expected ${currentFirst - 1}, got ${actualPage}`);
                        return;
                    }
                    if (document.getElementById(`mm-page-${actualPage}`)) {
                        return;
                    }
                    state.feedLoadedPages.add(actualPage);
                    state.feedFirstLoadedPage = actualPage;

                    const chNamePre = getCurrentChapterName("mm", actualPage + 1);
                    const chPartPre = chNamePre ? `<span class="badge-chapter">${escapeHtml(chNamePre)}</span><span class="badge-sep">•</span>` : "";

                    const div = document.createElement("div");
                    div.className = "page-divider";
                    div.setAttribute("data-page", actualPage + 1);
                    div.innerHTML = `
                        <div class="divider-line"></div>
                        <div class="divider-badge">
                            <span class="badge-icon">📖</span>
                            ${chPartPre}
                            <span class="badge-text">စာမျက်နှာ ${toMyanmarNum(actualPage + 1)}</span>
                        </div>
                        <div class="divider-line"></div>
                    `;

                    const sec = document.createElement("section");
                    sec.className = "feed-page-item";
                    sec.id = `mm-page-${actualPage}`;
                    sec.setAttribute("data-page", actualPage);
                    sec.innerHTML = data.content;

                    const oldScrollHeight = el.readerContainer.scrollHeight;
                    const oldScrollTop = el.readerContainer.scrollTop;

                    el.paliContent.insertBefore(div, el.paliContent.firstChild);
                    el.paliContent.insertBefore(sec, div);
                    try { injectAnnotationPins(sec, bookId, actualPage); } catch (e) { console.warn(e); }

                    const heightAdded = el.readerContainer.scrollHeight - oldScrollHeight;
                    el.readerContainer.scrollTop = oldScrollTop + heightAdded;

                    if (pageVisibilityObserver) {
                        try { pageVisibilityObserver.observe(sec); } catch (e) { console.warn(e); }
                    }

                    if (el.loadPrevBox && el.loadPrevText) {
                        if (actualPage > data.first_page) {
                            el.loadPrevBox.style.display = "flex";
                            el.loadPrevText.textContent = `ယခင်စာမျက်နှာ (${toMyanmarNum(actualPage - 1)}) ကို ဆွဲယူရန်`;
                        } else {
                            el.loadPrevBox.style.display = "none";
                        }
                    }
                }
            } else {
                // Single page mode
                state.mmPage = actualPage;
                el.bookTitleDisplay.textContent = withVolumeLabel(state.mmBookId, data.book_name);
                el.chapterTitleDisplay.textContent = data.chapter_name || "";
                el.totalPageDisplay.textContent = toMyanmarNum(data.last_page);
                el.metaBookName.textContent = data.book_name;
                el.metaPageNum.textContent = toMyanmarNum(actualPage);
                el.footerCurrentPage.textContent = toMyanmarNum(actualPage);
                el.footerTotalPage.textContent = toMyanmarNum(data.last_page);
                el.pageNumberInput.value = toMyanmarNum(actualPage);
                el.pageNumberInput.min = data.first_page;
                el.pageNumberInput.max = data.last_page;

                el.btnPrevPage.disabled = !data.has_prev;
                el.btnNextPage.disabled = !data.has_next;
                el.btnFooterPrev.style.visibility = data.has_prev ? "visible" : "hidden";
                el.btnFooterNext.style.visibility = data.has_next ? "visible" : "hidden";

                el.paliContent.innerHTML = data.content;
                el.readerContainer.scrollTop = 0;
                
                if (el.loadPrevBox) el.loadPrevBox.style.display = "none";
                if (el.infiniteSentinel) el.infiniteSentinel.style.display = "none";
                updateScrollIndicator(actualPage, data.last_page);

                try { highlightActiveToc(actualPage); } catch (e) { console.warn(e); }
                try { debounceRecent(bookId, actualPage); } catch (e) { console.warn(e); }
                try { injectAnnotationPins(el.paliContent, bookId, actualPage); } catch (e) { console.warn(e); }
                try { applyNissayaToCurrentPage(); } catch (e) { console.warn(e); }
                try { applyPendingSearchHighlight(el.paliContent); } catch (e) { console.warn(e); }
            }
        }

        if (isSplitRightPane || state.readerMode === "split") {
            state.mmBookId = data.book_id;
            state.mmBookName = data.book_name;
            state.mmPage = actualPage;
            state.mmFirstPage = data.first_page;
            state.mmLastPage = data.last_page;
            if (el.splitMMTitle) el.splitMMTitle.textContent = data.book_name;
            if (el.splitMMPageInput) {
                el.splitMMPageInput.value = actualPage;
                el.splitMMPageInput.min = data.first_page;
                el.splitMMPageInput.max = data.last_page;
            }
            if (el.splitMMTotalDisplay) el.splitMMTotalDisplay.textContent = toMyanmarNum(data.last_page);
            if (el.btnSplitMMPrev) el.btnSplitMMPrev.disabled = !data.has_prev;
            if (el.btnSplitMMNext) el.btnSplitMMNext.disabled = !data.has_next;
            if (el.splitMMContent) {
                el.splitMMContent.innerHTML = cleanMMContent(data.content);
                try { applyPendingSearchHighlight(el.splitMMContent); } catch (e) { console.warn(e); }
            }
            if (el.bookTitleDisplay && state.readerMode === "split") {
                el.bookTitleDisplay.textContent = `${withVolumeLabel(state.paliBookId, state.paliBookName || 'ပါဠိတော်')} ↔ ${withVolumeLabel(data.book_id, data.book_name)}`;
            }
            try { attachSplitViewParagraphListeners(); } catch (e) { console.warn(e); }
            if (state.readerMode === "split") {
                try { debounceRecent(state.paliBookId, state.paliPage); } catch (e) { console.warn(e); }
            }
        }

    } catch (err) {
        console.error("Failed to load mm page:", err);
        // Same anti-freeze guard as the Pali loader: keep a retry on screen
        // ONLY if content hasn't been rendered yet.
        const hasContent = el.paliContent && el.paliContent.querySelector(".feed-page-item, p");
        if (!hasContent && !isSplitRightPane && !isAppend && !isPrepend && el.paliContent) {
            el.paliContent.innerHTML = `
                <div class="page-error-state" style="padding:40px 16px;text-align:center;">
                    <p style="margin-bottom:14px;">စာမျက်နှာ ဆွဲယူရာတွင် အမှားတစ်ခု ဖြစ်ပွားပါသည်။</p>
                    <button class="tool-btn" onclick='loadMMPage(${JSON.stringify(bookId)}, ${targetNum})'>ပြန်လည်ကြိုးစားရန်</button>
                </div>
            `;
        }
    }
}

// ----------------- Split View Logic & Dynamic Companion Tabs -----------------

async function renderSplitView() {
    el.bookTitleDisplay.textContent = `${withVolumeLabel(state.paliBookId, state.paliBookName || 'ပါဠိတော်')} ↔ တွဲဖက်ကျမ်း`;
    el.chapterTitleDisplay.textContent = "ကျမ်းစာ ယှဉ်တွဲဖတ်ရှုခြင်း (Split View)";
    el.pageNumberInput.value = toMyanmarNum(state.paliPage);
    el.totalPageDisplay.textContent = toMyanmarNum(state.paliLastPage || 1);

    // 1. Ensure companion metadata is loaded for current book
    if (!state.companionData || (state.companionData.current && state.companionData.current.id !== state.paliBookId)) {
        try {
            const res = await fetch(`/api/pali/companions/${state.paliBookId}`);
            if (res.ok) {
                state.companionData = await res.json();
                renderRelatedDropdown();
            }
        } catch (e) {
            console.error("Failed to load companion data:", e);
        }
    }

    // 2. Render dynamic companion tabs in right pane header
    renderCompanionTabs();

    // 3. Load left Pali page
    await loadPaliPage(state.paliBookId, state.paliPage);

    // 4. Sync right companion pane
    await syncSplitCompanionPane(state.paliBookId, state.paliPage);

    debounceRecent(state.paliBookId, state.paliPage);
}

function renderCompanionTabs() {
    const comp = state.companionData;
    if (!el.companionTabsBar) return;

    const availableTabs = [];
    if (comp) {
        if (comp.attha && comp.attha.length > 0) availableTabs.push({ type: "attha", label: "📖 အဋ္ဌကထာ", books: comp.attha });
        if (comp.tika && comp.tika.length > 0) availableTabs.push({ type: "tika", label: "📜 ဋီကာ", books: comp.tika });
        if (comp.mula && comp.mula.length > 0) availableTabs.push({ type: "mula", label: "☸️ မူလပါဠိ", books: comp.mula });
        if (comp.mm && comp.mm.length > 0) availableTabs.push({ type: "mm", label: "🇲🇲 မြန်မာပြန်", books: comp.mm });
    }

    if (availableTabs.length === 0) {
        availableTabs.push({ type: "mm", label: "🇲🇲 မြန်မာပြန်", books: [] });
    }

    // If current selected type is not available, pick first
    if (!availableTabs.some(t => t.type === state.splitRightType)) {
        state.splitRightType = availableTabs[0].type;
    }

    let tabsHtml = "";
    availableTabs.forEach(t => {
        const isActive = t.type === state.splitRightType;
        tabsHtml += `<button class="comp-tab ${isActive ? 'active' : ''}" data-type="${t.type}">${t.label}</button>`;
    });
    el.companionTabsBar.innerHTML = tabsHtml;

    // Attach click listeners to companion tabs
    el.companionTabsBar.querySelectorAll(".comp-tab").forEach(tab => {
        tab.addEventListener("click", async () => {
            const type = tab.getAttribute("data-type");
            if (type === state.splitRightType) return;
            state.splitRightType = type;
            state.splitRightBookId = null;
            localStorage.setItem("tipitaka_split_comp_type", type);
            renderCompanionTabs();
            await syncSplitCompanionPane(state.paliBookId, state.paliPage);
        });
    });

    updateCompanionVolumeSelector();
}

function updateCompanionVolumeSelector() {
    if (!el.compVolumeBox || !el.compVolumeSelect) return;
    const comp = state.companionData;
    if (!comp) {
        el.compVolumeBox.style.display = "none";
        return;
    }

    let books = [];
    if (state.splitRightType === "attha") books = comp.attha || [];
    else if (state.splitRightType === "tika") books = comp.tika || [];
    else if (state.splitRightType === "mula") books = comp.mula || [];
    else if (state.splitRightType === "mm") books = comp.mm || [];

    if (books.length <= 1) {
        el.compVolumeBox.style.display = "none";
        return;
    }

    el.compVolumeBox.style.display = "inline-flex";
    let optHtml = "";
    books.forEach(b => {
        const isSelected = (b.id === state.splitRightBookId);
        optHtml += `<option value="${b.id}" ${isSelected ? 'selected' : ''}>${escapeHtml(b.name)}</option>`;
    });
    el.compVolumeSelect.innerHTML = optHtml;

    // Remove old listeners by cloning
    const newSelect = el.compVolumeSelect.cloneNode(true);
    el.compVolumeSelect.parentNode.replaceChild(newSelect, el.compVolumeSelect);
    el.compVolumeSelect = newSelect;

    el.compVolumeSelect.addEventListener("change", async (e) => {
        state.splitRightBookId = e.target.value;
        await syncSplitCompanionPane(state.paliBookId, state.paliPage, state.splitRightBookId);
    });
}

async function openSplitCompanion(compType, compId) {
    state.splitRightType = compType;
    state.splitRightBookId = compId;
    localStorage.setItem("tipitaka_split_comp_type", compType);
    setReaderMode("split");
}

async function syncSplitCompanionPane(sourceBook, sourcePage, specificTargetBook = null) {
    if (state.readerMode !== "split") return;

    const comp = state.companionData;
    const type = state.splitRightType || "attha";
    let candidateBooks = [];

    if (specificTargetBook) {
        candidateBooks = [specificTargetBook];
    } else if (comp) {
        if (type === "attha" && comp.attha) candidateBooks = comp.attha.map(b => b.id);
        else if (type === "tika" && comp.tika) candidateBooks = comp.tika.map(b => b.id);
        else if (type === "mula" && comp.mula) candidateBooks = comp.mula.map(b => b.id);
        else if (type === "mm" && comp.mm) candidateBooks = comp.mm.map(b => b.id);
    }

    if (candidateBooks.length === 0) {
        if (type === "mm" && state.mmBookId) candidateBooks = [state.mmBookId];
    }

    const targetTypeParam = (type === "mm") ? "mm" : "pali";
    const targetBooksParam = candidateBooks.join(",");

    try {
        const url = `/api/match/pali_to_companion?source_book=${encodeURIComponent(sourceBook)}&source_page=${sourcePage}&target_type=${targetTypeParam}&target_books=${encodeURIComponent(targetBooksParam)}`;
        const res = await fetch(url);
        if (res.ok) {
            const matchData = await res.json();
            const targetBid = matchData.target_book || (candidateBooks.length > 0 ? candidateBooks[0] : null);
            const targetPg = matchData.target_page || 1;

            if (targetBid) {
                state.splitRightBookId = targetBid;
                state.splitRightPage = targetPg;

                if (el.compVolumeSelect) {
                    el.compVolumeSelect.value = targetBid;
                }

                await loadSplitRightPage(targetBid, targetPg, type, matchData.matched_para);
            }
        }
    } catch (err) {
        console.error("Failed to sync companion pane:", err);
    }
}

async function loadSplitRightPage(bookId, pageNum, type, matchedPara = null) {
    if (!el.splitRightContent) return;

    if (type === "mm") {
        try {
            // ?light=1: the companion pane never uses matching_pali, so it
            // must not pay for the cross-link lookup (page-speed fix B).
            const res = await fetch(`/api/mm/page/${bookId}/${pageNum}?light=1`);
            if (res.ok) {
                const data = await res.json();
                state.splitRightBookName = data.book_name;
                state.splitRightPage = data.page;
                state.splitRightLastPage = data.last_page;

                if (el.splitRightPageInput) {
                    el.splitRightPageInput.value = data.page;
                    el.splitRightPageInput.min = data.first_page;
                    el.splitRightPageInput.max = data.last_page;
                }
                if (el.splitRightTotalDisplay) el.splitRightTotalDisplay.textContent = toMyanmarNum(data.last_page);
                if (el.btnSplitRightPrev) el.btnSplitRightPrev.disabled = !data.has_prev;
                if (el.btnSplitRightNext) el.btnSplitRightNext.disabled = !data.has_next;

                el.splitRightContent.className = "split-pane-body mm-content";
                el.splitRightContent.innerHTML = cleanMMContent(data.content);
                applyPendingSearchHighlight(el.splitRightContent);

                attachSplitViewParagraphListeners();

                if (matchedPara) {
                    highlightMatchingParagraphInRight(matchedPara);
                }
            }
        } catch (e) {
            console.error("Failed to load MM companion page:", e);
        }
    } else {
        try {
            // ?light=1: the companion pane never uses matching_mm, so it
            // must not pay for the cross-link lookup (page-speed fix B).
            const res = await fetch(`/api/page/${bookId}/${pageNum}?light=1`);
            if (res.ok) {
                const data = await res.json();
                state.splitRightBookName = data.book_name;
                state.splitRightPage = data.page;
                state.splitRightLastPage = data.last_page;

                if (el.splitRightPageInput) {
                    el.splitRightPageInput.value = data.page;
                    el.splitRightPageInput.min = data.first_page;
                    el.splitRightPageInput.max = data.last_page;
                }
                if (el.splitRightTotalDisplay) el.splitRightTotalDisplay.textContent = toMyanmarNum(data.last_page);
                if (el.btnSplitRightPrev) el.btnSplitRightPrev.disabled = !data.has_prev;
                if (el.btnSplitRightNext) el.btnSplitRightNext.disabled = !data.has_next;

                el.splitRightContent.className = "split-pane-body pali-content";
                el.splitRightContent.innerHTML = cleanPaliContent(data.content);
                applyPendingSearchHighlight(el.splitRightContent);

                attachSplitViewParagraphListeners();

                if (matchedPara) {
                    highlightMatchingParagraphInRight(matchedPara);
                }
            }
        } catch (e) {
            console.error("Failed to load Pali companion page:", e);
        }
    }
}

function highlightMatchingParagraphInRight(paraNum) {
    if (!el.splitRightContent) return;
    const numStr = toMyanmarNum(paraNum);
    let target = el.splitRightContent.querySelector(`a[name="para${paraNum}"]`);
    if (!target) {
        const markers = el.splitRightContent.querySelectorAll(".paranum, .hangnum, .paragraph");
        for (const m of markers) {
            if (m.textContent.includes(numStr) || fromMyanmarNum(m.textContent.trim()) === paraNum) {
                target = m;
                break;
            }
        }
    }
    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const p = target.closest("p") || target;
        p.classList.add("para-highlight-pulse");
        setTimeout(() => p.classList.remove("para-highlight-pulse"), 2400);
    }
}

function attachSplitViewParagraphListeners() {
    if (state.readerMode !== "split") return;

    // 1. Click on Pali paragraph marker in left pane to jump/scroll in right pane
    if (el.splitPaliContent) {
        el.splitPaliContent.querySelectorAll(".paranum, .hangnum, a[name^='para']").forEach(elem => {
            elem.style.cursor = "pointer";
            elem.title = "ကလစ်နှိပ်ပါက ညာဘက်တွဲဖက်ကျမ်းရှိ ဤအပိုဒ်သို့ တိုက်ရိုက်ရွေ့ပါမည်";
            elem.onclick = (e) => {
                e.stopPropagation();
                let text = elem.textContent.trim();
                let num = fromMyanmarNum(text);
                if (!num && elem.name) {
                    const m = elem.name.match(/\d+/);
                    if (m) num = parseInt(m[0], 10);
                }
                if (!num && elem.querySelector) {
                    const pn = elem.querySelector(".paranum");
                    if (pn) num = fromMyanmarNum(pn.textContent.trim());
                }
                if (num) {
                    if (state.splitRightType === "mm") {
                        scrollToMatchingMMParagraph(num);
                    } else {
                        scrollToMatchingPaliCompanionParagraph(num);
                    }
                }
            };
        });
    }

    // 2. Click on paragraph number in right pane to jump/scroll to matching Left Pali text
    if (el.splitRightContent) {
        el.splitRightContent.querySelectorAll(".paranum, .hangnum, .paragraph, a[name^='para']").forEach(elem => {
            elem.style.cursor = "pointer";
            elem.title = "ကလစ်နှိပ်ပါက ဘယ်ဘက်ပါဠိတော်ရှိ ဤအပိုဒ်သို့ တိုက်ရိုက်ရွေ့ပါမည်";
            elem.onclick = (e) => {
                e.stopPropagation();
                let text = elem.textContent.trim();
                let num = fromMyanmarNum(text);
                if (!num && elem.name) {
                    const m = elem.name.match(/\d+/);
                    if (m) num = parseInt(m[0], 10);
                }
                if (!num && elem.querySelector) {
                    const pn = elem.querySelector(".paranum");
                    if (pn) num = fromMyanmarNum(pn.textContent.trim());
                }
                if (num) {
                    scrollToMatchingPaliParagraph(num);
                }
            };
        });
    }
}

async function scrollToMatchingPaliCompanionParagraph(paraNum) {
    if (!el.splitRightContent) return;
    const numStr = toMyanmarNum(paraNum);

    let target = el.splitRightContent.querySelector(`a[name="para${paraNum}"]`);
    if (!target) {
        const markers = el.splitRightContent.querySelectorAll(".paranum, .hangnum");
        for (const m of markers) {
            if (m.textContent.includes(numStr) || fromMyanmarNum(m.textContent.trim()) === paraNum) {
                target = m;
                break;
            }
        }
    }

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const p = target.closest("p") || target;
        p.classList.add("para-highlight-pulse");
        setTimeout(() => p.classList.remove("para-highlight-pulse"), 2400);
        showScrollToast(`တွဲဖက်ကျမ်း အပိုဒ် (${numStr}) သို့ ရွေ့ပြီးပါပြီ`);
        return;
    }

    try {
        const res = await fetch(`/api/match/para_to_page?pali_book_id=${state.splitRightBookId}&para=${paraNum}`);
        if (res.ok) {
            const data = await res.json();
            if (data.pali_page) {
                showScrollToast(`တွဲဖက်ကျမ်း စာမျက်နှာ ${toMyanmarNum(data.pali_page)} (အပိုဒ် ${numStr}) သို့ ပြောင်းနေပါသည်...`);
                await loadSplitRightPage(state.splitRightBookId, data.pali_page, state.splitRightType, paraNum);
            }
        }
    } catch (e) {
        console.error("Failed to match para to companion page:", e);
    }
}

async function scrollToMatchingMMParagraph(paraNum) {
    if (!el.splitRightContent) return;
    const mmNumStr = toMyanmarNum(paraNum);

    let target = null;
    const spans = el.splitRightContent.querySelectorAll(".paragraph");
    for (const s of spans) {
        if (s.textContent.trim() === mmNumStr || fromMyanmarNum(s.textContent.trim()) === paraNum) {
            target = s;
            break;
        }
    }

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const parentP = target.closest("p") || target;
        parentP.classList.add("para-highlight-pulse");
        setTimeout(() => parentP.classList.remove("para-highlight-pulse"), 2400);
        showScrollToast(`မြန်မာပြန် အပိုဒ် (${mmNumStr}) သို့ ရွေ့ပြီးပါပြီ`);
        return;
    }

    try {
        const res = await fetch(`/api/match/para_to_page?pali_book_id=${state.paliBookId}&mm_book_id=${state.splitRightBookId || state.mmBookId}&para=${paraNum}`);
        if (res.ok) {
            const data = await res.json();
            if (data.mm_page) {
                showScrollToast(`မြန်မာပြန် စာမျက်နှာ ${toMyanmarNum(data.mm_page)} (အပိုဒ် ${mmNumStr}) သို့ ပြောင်းနေပါသည်...`);
                await loadSplitRightPage(data.mm_book_id || state.splitRightBookId || state.mmBookId, data.mm_page, "mm", paraNum);
            }
        }
    } catch (e) {
        console.error("Failed to match para to mm page:", e);
    }
}

async function scrollToMatchingPaliParagraph(paraNum) {
    if (!el.splitPaliContent) return;
    const mmNumStr = toMyanmarNum(paraNum);

    let target = el.splitPaliContent.querySelector(`a[name="para${paraNum}"]`);
    if (!target) {
        const spans = el.splitPaliContent.querySelectorAll(".paranum");
        for (const s of spans) {
            if (s.textContent.trim() === mmNumStr || fromMyanmarNum(s.textContent.trim()) === paraNum) {
                target = s;
                break;
            }
        }
    }

    if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const parentP = target.closest("p") || target;
        parentP.classList.add("para-highlight-pulse");
        setTimeout(() => parentP.classList.remove("para-highlight-pulse"), 2400);
        showScrollToast(`ပါဠိတော် အပိုဒ် (${mmNumStr}) သို့ ရွေ့ပြီးပါပြီ`);
        return;
    }

    try {
        const res = await fetch(`/api/match/para_to_page?pali_book_id=${state.paliBookId}&para=${paraNum}`);
        if (res.ok) {
            const data = await res.json();
            if (data.pali_page) {
                showScrollToast(`ပါဠိတော် စာမျက်နှာ ${toMyanmarNum(data.pali_page)} (အပိုဒ် ${mmNumStr}) သို့ ပြောင်းနေပါသည်...`);
                await loadPaliPage(data.pali_book_id || state.paliBookId, data.pali_page);
                setTimeout(() => {
                    if (el.splitPaliContent) {
                        let newTarget = el.splitPaliContent.querySelector(`a[name="para${paraNum}"]`);
                        if (!newTarget) {
                            const spans = el.splitPaliContent.querySelectorAll(".paranum");
                            for (const s of spans) {
                                if (s.textContent.trim() === mmNumStr || fromMyanmarNum(s.textContent.trim()) === paraNum) {
                                    newTarget = s;
                                    break;
                                }
                            }
                        }
                        if (newTarget) {
                            newTarget.scrollIntoView({ behavior: "smooth", block: "center" });
                            const p = newTarget.closest("p") || newTarget;
                            p.classList.add("para-highlight-pulse");
                            setTimeout(() => p.classList.remove("para-highlight-pulse"), 2400);
                        }
                    }
                }, 150);
            }
        }
    } catch (e) {
        console.error("Failed to match para to pali page:", e);
    }
}

async function handleSplitSync() {
    showScrollToast("တွဲဖက်ကျမ်းစာနှင့် ပြန်လည်ချိန်ညှိနေပါသည်...");
    await syncSplitCompanionPane(state.paliBookId, state.paliPage);
    showScrollToast("တွဲဖက်ကျမ်းစာ ပြန်လည်ချိန်ညှိပြီးပါပြီ ✨");
}

// ----------------- Category & Catalog Helpers (APK Style) -----------------

function getCleanCategoryName(catName, catId) {
    const map = {
        'vi': 'ဝိနယပိဋက',
        'di': 'ဒီဃနိကာယ',
        'ma': 'မဇ္ဈိမနိကာယ',
        'sa': 'သံယုတ္တနိကာယ',
        'an': 'အင်္ဂုတ္တရနိကာယ',
        'ku': 'ခုဒ္ဒကနိကာယ',
        'bi': 'အဘိဓမ္မပိဋက',
        'annya_vi': 'ဝိနယ',
        'annya_bi': 'အဘိဓမ္မ',
        'annya_sadda': 'ဗျာကရဏာဒိ'
    };
    if (catId && map[catId]) return map[catId];
    if (!catName) return "";
    return catName.replace(/\(.*?\)/g, "").trim() || catName;
}

// ----------------- Focus / Fullscreen Mode Controller -----------------

function toggleFocusBars(forceState) {
    if (!state.isFocusMode) return;
    const isRevealed = (typeof forceState === "boolean")
        ? forceState
        : !document.body.classList.contains("focus-bars-revealed");
    document.body.classList.toggle("focus-bars-revealed", isRevealed);
}

async function toggleFocusMode(enable) {
    if (typeof enable !== "boolean") {
        enable = !state.isFocusMode;
    }
    state.isFocusMode = enable;
    document.body.classList.toggle("focus-mode", enable);
    if (!enable) {
        document.body.classList.remove("focus-bars-revealed");
    } else {
        // Automatically close sidebars and drawers when entering focus mode
        if (state.isSidebarOpen) toggleSidebar(false);
        if (state.isDictOpen) toggleDictSidebar(false);
        closeSidebarMobile();
    }

    // Update icons & tooltips
    if (el.btnToggleFullscreen) {
        el.btnToggleFullscreen.title = enable 
            ? "ပုံမှန်မြင်ကွင်းသို့ ပြန်သွားရန် (Esc / Focus Mode)" 
            : "မျက်နှာပြင်ပြည့် / အာရုံစူးစိုက်ဖတ်ရှုရန် (Focus Mode - F11)";
        el.btnToggleFullscreen.classList.toggle("active", enable);
    }
    if (el.btnToggleFullscreenMobile) {
        el.btnToggleFullscreenMobile.classList.toggle("active", enable);
    }
    if (el.fullscreenIcon) {
        if (enable) {
            // Compress icon
            el.fullscreenIcon.innerHTML = `<path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"></path>`;
        } else {
            // Expand icon
            el.fullscreenIcon.innerHTML = `<path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>`;
        }
    }
    if (el.fullscreenMobileLabel) {
        el.fullscreenMobileLabel.textContent = enable 
            ? "ပုံမှန်မြင်ကွင်းသို့ ပြန်သွားရန်" 
            : "မျက်နှာပြင်ပြည့် ဖတ်ရှုရန် (Focus Mode)";
    }

    // Trigger HTML5 Fullscreen API with iOS Safari pseudo-fullscreen fallback
    const isFullscreenSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
    try {
        const docEl = document.documentElement;
        if (enable) {
            if (isFullscreenSupported) {
                if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                    if (docEl.requestFullscreen) {
                        await docEl.requestFullscreen();
                    } else if (docEl.webkitRequestFullscreen) {
                        await docEl.webkitRequestFullscreen();
                    }
                }
            } else {
                document.body.classList.add("ios-fullscreen-fallback");
            }
        } else {
            document.body.classList.remove("ios-fullscreen-fallback");
            if (document.fullscreenElement || document.webkitFullscreenElement) {
                if (document.exitFullscreen) {
                    await document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    await document.webkitExitFullscreen();
                }
            }
        }
    } catch (err) {
        console.warn("Fullscreen API note:", err);
        if (enable) {
            document.body.classList.add("ios-fullscreen-fallback");
        }
    }
}

// ----------------- App View Controller (Home vs Reader) -----------------

function switchToSidebarTab(tabId) {
    if (!el.sidebarTabBtns || !el.sidebarPanels) return;
    el.sidebarTabBtns.forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === tabId));
    el.sidebarPanels.forEach(p => p.classList.toggle("active", p.id === tabId));
    state.activeTab = tabId;
}

function setAppView(view) {
    state.appView = view;

    const isHome = (view === "home");
    
    if (isHome) {
        document.body.classList.add("view-home");
        document.body.classList.remove("view-reader");
        document.body.classList.remove("chrome-hidden");
        if (typeof closeEditionSwitcher === "function") closeEditionSwitcher();
        if (typeof closeReaderMoreSheet === "function") closeReaderMoreSheet();
        const bNav = el.bottomNavBar || el.bottomNav;
        if (bNav) bNav.style.display = "";
        if (el.mobileReaderToolbar) el.mobileReaderToolbar.style.display = "none";
        if (el.homePage) el.homePage.style.display = "flex";
        if (el.readerContainer) el.readerContainer.style.display = "none";
        if (el.splitViewContainer) el.splitViewContainer.style.display = "none";
        if (el.appSidebar) el.appSidebar.classList.add("collapsed");
        if (el.dictSidebar) el.dictSidebar.classList.add("collapsed");
        renderHomeCatalog();
    } else {
        document.body.classList.remove("view-home");
        document.body.classList.add("view-reader");
        if (el.homePage) el.homePage.style.display = "none";
        if (window.innerWidth <= 768) {
            const bNav = el.bottomNavBar || el.bottomNav;
            if (bNav) bNav.style.display = "none";
            if (el.mobileReaderToolbar) el.mobileReaderToolbar.style.display = "flex";
            if (typeof updateReaderToolbarState === "function") updateReaderToolbarState();
        }
        if (state.readerMode === "split") {
            if (el.splitViewContainer) el.splitViewContainer.style.display = "flex";
            if (el.readerPaper) el.readerPaper.style.display = "none";
        } else {
            if (el.readerContainer) el.readerContainer.style.display = "flex";
            if (el.readerPaper) el.readerPaper.style.display = "flex";
        }

        // On desktop/tablets (> 992px), open sidebar and activate TOC tab by default!
        if (window.innerWidth > 992) {
            state.isSidebarOpen = true;
            if (el.appSidebar) el.appSidebar.classList.remove("collapsed");
            localStorage.setItem("tipitaka_sidebar_open", "1");
            switchToSidebarTab("tab-toc");
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        } else {
            // On mobile, ensure TOC tab is active inside the drawer
            switchToSidebarTab("tab-toc");
        }

        // Sync dictionary sidebar with persisted open state. Without this,
        // a persisted isDictOpen=true (dictionary open last session) leaves
        // the sidebar collapsed from the home view while lookupDictionary()
        // skips toggleDictSidebar() — word taps would load definitions into
        // an invisible sidebar.
        if (el.dictSidebar) el.dictSidebar.classList.toggle("collapsed", !state.isDictOpen);
    }

    // Update bottom navigation bar active states
    if (el.btnNavHome) el.btnNavHome.classList.toggle("active", isHome);
    if (el.btnNavReader) el.btnNavReader.classList.toggle("active", !isHome);
    if (el.btnNavRecent) el.btnNavRecent.classList.remove("active");
    if (el.btnNavDict) el.btnNavDict.classList.toggle("active", state.isDictOpen);
    if (el.btnNavMore) el.btnNavMore.classList.toggle("active", state.isSidebarOpen);
}

// ----------------- Home Page Catalog (APK Style) -----------------

async function renderHomeCatalog() {
    if (!el.homeCatalogInner) return;
    const isPali = (state.readerMode !== "mm");
    const basket = state.homeBasket || "mula";

    // Update Title and Mode Toggle Label
    if (el.homeAppTitle) {
        el.homeAppTitle.textContent = isPali ? "တိပိဋကပါဠိ" : "တိပိဋကမြန်မာပြန်";
    }
    if (el.homeModeToggleLabel) {
        el.homeModeToggleLabel.textContent = isPali ? "🇲🇲 မြန်မာပြန်သို့" : "☸️ ပါဠိတော်သို့";
    }

    // Continue Reading card (ဆက်ဖတ်ရန်) — layered design: Home is FIND layer
    try {
        const hist = HistoryManager.getReadingHistory();
        const card = document.getElementById("homeContinueCard");
        if (card && hist && hist.length > 0) {
            const top = hist[0];
            const bookEl = document.getElementById("homeContinueBook");
            const pageEl = document.getElementById("homeContinuePage");
            if (bookEl) bookEl.textContent = top.bookName || top.bookId || "—";
            if (pageEl) pageEl.textContent = "စာမျက်နှာ " + (top.page || 1);
            card.style.display = "block";
            card.onclick = () => {
                if (top.mode === "mm") {
                    setReaderMode("mm");
                    loadMMBook(top.bookId, top.page || 1);
                } else if (top.mode === "nissaya") {
                    setReaderMode("nissaya");
                    loadPaliBook(top.bookId, top.page || 1);
                } else if (top.mode === "split") {
                    setReaderMode("split");
                    loadPaliBook(top.bookId, top.page || 1);
                    if (top.splitMMBookId) loadMMPage(top.splitMMBookId, top.splitMMPage || 1);
                } else {
                    setReaderMode("pali");
                    loadPaliBook(top.bookId, top.page || 1);
                }
                setAppView("reader");
            };
        } else if (card) {
            card.style.display = "none";
        }
    } catch (e) { /* history unavailable — card stays hidden */ }

    // Basket Tabs for Pali (ပါဠိ, အဋ္ဌကထာ, ဋီကာ, အည)
    if (el.homeBasketTabs) {
        if (isPali) {
            el.homeBasketTabs.style.display = "flex";
            el.homeBasketTabs.querySelectorAll(".home-basket-tab").forEach(tab => {
                tab.classList.toggle("active", tab.getAttribute("data-basket") === basket);
            });
        } else {
            el.homeBasketTabs.style.display = "none";
        }
    }

    // Auto-fetch if categories not ready
    if (isPali && (!state.paliCategories || state.paliCategories.length === 0)) {
        try {
            const res = await fetch("/api/categories");
            if (res.ok) state.paliCategories = await res.json();
        } catch (e) {
            console.error("Auto fetch categories failed:", e);
        }
    } else if (!isPali && (!state.mmCategories || state.mmCategories.length === 0)) {
        try {
            const res = await fetch("/api/mm/categories");
            if (res.ok) state.mmCategories = await res.json();
        } catch (e) {
            console.error("Auto fetch MM categories failed:", e);
        }
    }

    let html = "";
    if (isPali && state.paliCategories && state.paliCategories.length > 0) {
        state.paliCategories.forEach(cat => {
            const cleanCatName = escapeHtml(getCleanCategoryName(cat.name, cat.id));
            const books = (cat.books || []).filter(b => b.basket === basket);
            if (books.length > 0) {
                html += `
                    <div class="home-cat-section">
                        <div class="home-cat-header">${cleanCatName}</div>
                        <div class="home-book-list">
                `;
                books.forEach(b => {
                    html += `
                        <button class="home-book-row" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(b.name)}">
                            <span class="home-book-name">${escapeHtml(b.name)}${volumeBadgeHtml(b.id)}</span>
                        </button>
                    `;
                });
                html += `
                        </div>
                    </div>
                `;
            }
        });
    } else if (!isPali && state.mmCategories && state.mmCategories.length > 0) {
        // Myanmar translations catalog (60 books)
        state.mmCategories.forEach(cat => {
            const cleanCatName = escapeHtml(getCleanCategoryName(cat.name, cat.id));
            if (cat.books && cat.books.length > 0) {
                html += `
                    <div class="home-cat-section">
                        <div class="home-cat-header">${cleanCatName}</div>
                        <div class="home-book-list">
                `;
                cat.books.forEach(b => {
                    html += `
                        <button class="home-book-row" data-id="${escapeHtml(b.id)}" data-name="${escapeHtml(b.name)}">
                            <span class="home-book-name">${escapeHtml(b.name)}${volumeBadgeHtml(b.id)}</span>
                        </button>
                    `;
                });
                html += `
                        </div>
                    </div>
                `;
            }
        });
    }

    el.homeCatalogInner.innerHTML = html || `
        <div class="empty-state" style="padding: 40px 16px; text-align: center;">
            <p>ကျမ်းစာအုပ်များ စာရင်းဆွဲယူနေပါသည်...</p>
            <button class="tool-btn" style="margin-top: 10px;" onclick="loadCategories()">ပြန်လည်ဆွဲယူရန် (Reload)</button>
        </div>
    `;

    // Book row click listener: open book & transition to reader
    el.homeCatalogInner.querySelectorAll(".home-book-row").forEach(row => {
        row.addEventListener("click", async () => {
            const bId = row.getAttribute("data-id");
            if (state.readerMode === "mm") {
                await loadMMBook(bId, null);
            } else {
                await loadPaliBook(bId, null);
            }
            setAppView("reader");
        });
    });
}

// ----------------- Sidebar Rendering -----------------

function renderBooksTree() {
    const filterText = (el.booksFilterInput.value || "").trim().toLowerCase();
    let html = "";

    if (state.readerMode === "mm") {
        // Render Myanmar 60 Books
        state.mmCategories.forEach(cat => {
            const cleanCatName = getCleanCategoryName(cat.name, cat.id);
            const filtered = cat.books.filter(b => !filterText || b.name.toLowerCase().includes(filterText));
            if (filtered.length > 0) {
                html += `<div class="category-group">
                    <div class="category-header">${cleanCatName}</div>`;
                filtered.forEach(b => {
                    const isActive = (b.id === state.mmBookId);
                    html += `
                        <button class="book-item-btn ${isActive ? 'active' : ''}" data-id="${b.id}" data-name="${b.name}">
                            <span class="book-name-text">${b.name}${volumeBadgeHtml(b.id)}</span>
                            <span class="book-pages-badge">${b.page_count} မျက်နှာ</span>
                        </button>
                    `;
                });
                html += `</div>`;
            }
        });
    } else {
        // Render Pali Books
        const basket = state.activeBasket;
        state.paliCategories.forEach(cat => {
            const cleanCatName = getCleanCategoryName(cat.name, cat.id);
            const filtered = cat.books.filter(b => {
                const matchesBasket = (basket === "all" || b.basket === basket);
                const matchesText = !filterText || b.name.toLowerCase().includes(filterText) || (b.short_name && b.short_name.toLowerCase().includes(filterText));
                return matchesBasket && matchesText;
            });
            if (filtered.length > 0) {
                html += `<div class="category-group">
                    <div class="category-header">${cleanCatName}</div>`;
                filtered.forEach(b => {
                    const isActive = (b.id === state.paliBookId);
                    html += `
                        <button class="book-item-btn ${isActive ? 'active' : ''}" data-id="${b.id}" data-name="${b.name}">
                            <span class="book-name-text">${b.name}${volumeBadgeHtml(b.id)}</span>
                            <span class="book-pages-badge">${b.pagecount} မျက်နှာ</span>
                        </button>
                    `;
                });
                html += `</div>`;
            }
        });
    }

    el.booksTreeList.innerHTML = html || `<div class="empty-state">ကိုက်ညီသော ကျမ်းစာအုပ် မရှိပါ။</div>`;

    el.booksTreeList.querySelectorAll(".book-item-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const bId = btn.getAttribute("data-id");
            if (state.readerMode === "mm") {
                await loadMMBook(bId, null);
            } else {
                await loadPaliBook(bId, null);
            }
            setAppView("reader");
            if (window.innerWidth > 992) {
                switchToSidebarTab("tab-toc");
                const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
                highlightActiveToc(curPg, true);
            } else {
                closeSidebarMobile();
            }
        });
    });
}

function highlightActiveBookInSidebar() {
    const curId = (state.readerMode === "mm") ? state.mmBookId : state.paliBookId;
    el.booksTreeList.querySelectorAll(".book-item-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-id") === curId);
    });
}

// Cached button lists for O(1) highlight updates (rebuilt on every render).
let _tocBtnCache = [];
let _lastTocActiveBtn = null;
let _suttaBtnCache = [];
let _lastSuttaActiveBtn = null;

// In-memory per-book expanded state (no localStorage in v1)
const _tocExpandedByBook = new Map();
let _currentTocTree = [];
let _currentTocNodesByIndex = [];

function getTocBookKey() {
    const mode = (state.readerMode === "mm") ? "mm" : "pali";
    const bookId = (mode === "mm") ? state.mmBookId : state.paliBookId;
    return `${mode}_${bookId}`;
}

function getTocLevel(type) {
    if (type == null || type === "") return 1;
    const n = parseInt(type, 10);
    if (!isNaN(n) && n >= 1 && n <= 6) return n;
    const lower = String(type).trim().toLowerCase();
    if (lower === "chapter") return 1;
    if (lower === "title") return 2;
    if (lower === "subhead") return 3;
    if (lower === "subsubhead" || lower === "subsubhead-head") return 4;
    return 1;
}

function buildTocTree(items) {
    if (!items || items.length === 0) return [];
    const roots = [];
    const stack = [];
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const level = getTocLevel(item.type);
        const node = {
            item,
            level,
            index: i,
            id: "toc-node-" + i,
            children: [],
            parent: null
        };
        while (stack.length > 0 && stack[stack.length - 1].level >= level) {
            stack.pop();
        }
        if (stack.length === 0) {
            roots.push(node);
        } else {
            const parent = stack[stack.length - 1];
            node.parent = parent;
            parent.children.push(node);
        }
        stack.push(node);
    }
    return roots;
}

function rebuildTocBtnCache() {
    if (!el.tocList) return;
    _tocBtnCache = [...el.tocList.querySelectorAll(".toc-item-btn")].map(btn => ({
        btn,
        page: parseInt(btn.getAttribute("data-page"), 10),
        index: parseInt(btn.getAttribute("data-index"), 10)
    }));
}

function renderTOC() {
    if (!el.tocList) return;
    const tocs = (state.readerMode === "mm") ? state.mmTocs : state.paliTocs;
    if (!tocs || tocs.length === 0) {
        el.tocList.innerHTML = `<div class="empty-state">မာတိကာ အချက်အလက် မရှိပါ။</div>`;
        _tocBtnCache = [];
        _lastTocActiveBtn = null;
        _currentTocTree = [];
        _currentTocNodesByIndex = [];
        return;
    }

    const bookKey = getTocBookKey();
    if (!_tocExpandedByBook.has(bookKey)) {
        _tocExpandedByBook.set(bookKey, new Set());
    }
    const expandedSet = _tocExpandedByBook.get(bookKey);

    _currentTocTree = buildTocTree(tocs);
    _currentTocNodesByIndex = new Array(tocs.length);
    function indexNodes(nodes) {
        for (const node of nodes) {
            _currentTocNodesByIndex[node.index] = node;
            if (node.children.length > 0) indexNodes(node.children);
        }
    }
    indexNodes(_currentTocTree);

    function renderNodes(nodes) {
        let html = "";
        for (const node of nodes) {
            const hasChildren = node.children.length > 0;
            const isExpanded = expandedSet.has(node.id);
            const t = node.item;
            const typeClass = t.type ? `type-${t.type}` : 'type-item';

            html += `<div class="toc-node-wrapper" data-node-id="${node.id}" data-index="${node.index}">`;
            html += `  <div class="toc-item-row">`;
            if (hasChildren) {
                html += `    <button class="toc-toggle-btn${isExpanded ? ' expanded' : ''}" data-node-id="${node.id}" aria-label="ခေါက်/ဖြန့်" title="ခေါက်/ဖြန့်">`;
                html += `      <svg class="toc-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>`;
                html += `    </button>`;
            } else {
                html += `    <span class="toc-spacer"></span>`;
            }
            html += `    <button class="toc-item-btn ${typeClass}" data-page="${t.page_number}" data-index="${node.index}">`;
            html += `      <span class="toc-item-title-wrapper">`;
            html += `        <span class="toc-bullet-icon"></span>`;
            html += `        <span class="toc-text">${escapeHtml(t.name)}</span>`;
            html += `      </span>`;
            html += `      <span class="item-page-badge">စာ-${t.page_number}</span>`;
            html += `    </button>`;
            html += `  </div>`;

            if (hasChildren) {
                html += `  <div class="toc-children-list" id="children-${node.id}" style="display: ${isExpanded ? 'block' : 'none'};">`;
                html += renderNodes(node.children);
                html += `  </div>`;
            }
            html += `</div>`;
        }
        return html;
    }

    el.tocList.innerHTML = renderNodes(_currentTocTree);
    _lastTocActiveBtn = null;
    rebuildTocBtnCache();
    attachTocEventListeners();

    if (el.tocFilterInput && el.tocFilterInput.value.trim()) {
        handleTocFilter();
    } else {
        const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        highlightActiveToc(curPg, false);
    }
}

function attachTocEventListeners() {
    el.tocList.querySelectorAll(".toc-toggle-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const nodeId = btn.getAttribute("data-node-id");
            toggleTocNode(nodeId);
        });
    });

    el.tocList.querySelectorAll(".toc-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            clearPendingSearch();
            const p = parseInt(btn.getAttribute("data-page"), 10);
            if (state.readerMode === "mm") {
                loadMMPage(state.mmBookId, p);
            } else {
                loadPaliPage(state.paliBookId, p);
            }
            setAppView("reader");
            if (window.innerWidth <= 992) {
                closeSidebarMobile();
            } else {
                highlightActiveToc(p, true);
            }
        });
    });
}

function toggleTocNode(nodeId) {
    const bookKey = getTocBookKey();
    let expandedSet = _tocExpandedByBook.get(bookKey);
    if (!expandedSet) {
        expandedSet = new Set();
        _tocExpandedByBook.set(bookKey, expandedSet);
    }
    const isCurrentlyExpanded = expandedSet.has(nodeId);
    const nodeWrapper = el.tocList.querySelector(`.toc-node-wrapper[data-node-id="${nodeId}"]`);
    if (!nodeWrapper) return;
    const childrenList = nodeWrapper.querySelector(`#children-${nodeId}`);
    const toggleBtn = nodeWrapper.querySelector(`.toc-toggle-btn[data-node-id="${nodeId}"]`);

    if (isCurrentlyExpanded) {
        expandedSet.delete(nodeId);
        if (toggleBtn) toggleBtn.classList.remove("expanded");
        if (childrenList) childrenList.style.display = "none";
    } else {
        // Accordion rule: collapse sibling branches at the same level
        const parentWrapper = nodeWrapper.parentElement.closest(".toc-node-wrapper");
        const siblingContainer = parentWrapper ? parentWrapper.querySelector(".toc-children-list") : el.tocList;
        if (siblingContainer) {
            const siblingWrappers = Array.from(siblingContainer.children).filter(child => child.classList.contains("toc-node-wrapper") && child !== nodeWrapper);
            for (const sib of siblingWrappers) {
                const sibId = sib.getAttribute("data-node-id");
                if (sibId && expandedSet.has(sibId)) {
                    expandedSet.delete(sibId);
                    const sibBtn = sib.querySelector(`.toc-toggle-btn[data-node-id="${sibId}"]`);
                    const sibChildren = sib.querySelector(`#children-${sibId}`);
                    if (sibBtn) sibBtn.classList.remove("expanded");
                    if (sibChildren) sibChildren.style.display = "none";
                }
            }
        }
        expandedSet.add(nodeId);
        if (toggleBtn) toggleBtn.classList.add("expanded");
        if (childrenList) childrenList.style.display = "block";
    }
    _tocExpandedByBook.set(bookKey, expandedSet);
    rebuildTocBtnCache();
}

function expandAllToc() {
    const bookKey = getTocBookKey();
    let expandedSet = _tocExpandedByBook.get(bookKey);
    if (!expandedSet) {
        expandedSet = new Set();
        _tocExpandedByBook.set(bookKey, expandedSet);
    }
    for (const node of _currentTocNodesByIndex) {
        if (node && node.children.length > 0) {
            expandedSet.add(node.id);
        }
    }
    el.tocList.querySelectorAll(".toc-toggle-btn").forEach(b => b.classList.add("expanded"));
    el.tocList.querySelectorAll(".toc-children-list").forEach(c => c.style.display = "block");
    rebuildTocBtnCache();
    const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
    highlightActiveToc(curPg, true);
}

function collapseAllToc() {
    const bookKey = getTocBookKey();
    let expandedSet = _tocExpandedByBook.get(bookKey);
    if (expandedSet) {
        expandedSet.clear();
    }
    el.tocList.querySelectorAll(".toc-toggle-btn").forEach(b => b.classList.remove("expanded"));
    el.tocList.querySelectorAll(".toc-children-list").forEach(c => c.style.display = "none");
    rebuildTocBtnCache();
}

function handleTocFilter() {
    const q = (el.tocFilterInput && el.tocFilterInput.value || "").trim().toLowerCase();
    const oldEmpty = el.tocList.querySelector(".toc-search-empty");
    if (oldEmpty) oldEmpty.remove();

    if (!q) {
        const bookKey = getTocBookKey();
        const expandedSet = _tocExpandedByBook.get(bookKey) || new Set();
        for (const node of _currentTocNodesByIndex) {
            if (!node) continue;
            const wrapper = el.tocList.querySelector(`.toc-node-wrapper[data-node-id="${node.id}"]`);
            if (wrapper) wrapper.style.display = "";
            const childrenList = el.tocList.querySelector(`#children-${node.id}`);
            const toggleBtn = el.tocList.querySelector(`.toc-toggle-btn[data-node-id="${node.id}"]`);
            if (childrenList && toggleBtn) {
                const isExp = expandedSet.has(node.id);
                toggleBtn.classList.toggle("expanded", isExp);
                childrenList.style.display = isExp ? "block" : "none";
            }
        }
        rebuildTocBtnCache();
        const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        highlightActiveToc(curPg, false);
        return;
    }

    const matches = new Set();
    const ancestorSet = new Set();

    for (const node of _currentTocNodesByIndex) {
        if (!node) continue;
        if (node.item.name && node.item.name.toLowerCase().includes(q)) {
            matches.add(node.id);
            let p = node.parent;
            while (p) {
                ancestorSet.add(p.id);
                p = p.parent;
            }
        }
    }

    if (matches.size === 0) {
        el.tocList.querySelectorAll(".toc-node-wrapper").forEach(w => w.style.display = "none");
        const emptyDiv = document.createElement("div");
        emptyDiv.className = "empty-state toc-search-empty";
        emptyDiv.textContent = "မာတိကာ အချက်အလက် မရှိပါ။";
        el.tocList.appendChild(emptyDiv);
        _tocBtnCache = [];
        _lastTocActiveBtn = null;
        return;
    }

    for (const node of _currentTocNodesByIndex) {
        if (!node) continue;
        const wrapper = el.tocList.querySelector(`.toc-node-wrapper[data-node-id="${node.id}"]`);
        if (!wrapper) continue;
        const isMatch = matches.has(node.id);
        const isAncestor = ancestorSet.has(node.id);
        if (isMatch || isAncestor) {
            wrapper.style.display = "";
            if (isAncestor) {
                const childrenList = el.tocList.querySelector(`#children-${node.id}`);
                const toggleBtn = el.tocList.querySelector(`.toc-toggle-btn[data-node-id="${node.id}"]`);
                if (childrenList) childrenList.style.display = "block";
                if (toggleBtn) toggleBtn.classList.add("expanded");
            }
        } else {
            wrapper.style.display = "none";
        }
    }
    rebuildTocBtnCache();
}

function highlightActiveToc(currentPg, shouldScroll = false) {
    if (!el.tocList) return;
    const mode = (state.readerMode === "mm") ? "mm" : "pali";
    const tocs = (mode === "mm") ? state.mmTocs : state.paliTocs;
    const lastPage = (mode === "mm") ? state.mmLastPage : state.paliLastPage;
    
    if (!tocs || tocs.length === 0) {
        if (el.tocCurrentCard) el.tocCurrentCard.style.display = "none";
        if (el.mobileChapterBreadcrumb) {
            const bookName = (mode === "mm") ? (state.mmBookName || "မြန်မာပြန်") : (state.paliBookName || "ပါဠိတော်");
            const crumbBookId = (mode === "mm") ? state.mmBookId : state.paliBookId;
            if (el.mobileBreadcrumbBook) el.mobileBreadcrumbBook.textContent = withVolumeLabel(crumbBookId, bookName);
            if (el.mobileBreadcrumbChapter) el.mobileBreadcrumbChapter.textContent = "";
            if (el.mobileBreadcrumbPage) el.mobileBreadcrumbPage.textContent = `စာ-${toMyanmarNum(currentPg)}`;
        }
        return;
    }

    if (el.tocCurrentCard) el.tocCurrentCard.style.display = "block";

    let activeIndex = -1;
    for (let i = 0; i < tocs.length; i++) {
        if (tocs[i].page_number <= currentPg) {
            activeIndex = i;
        } else {
            break;
        }
    }

    const activeTocObj = (activeIndex >= 0) ? tocs[activeIndex] : tocs[0];
    const nextTocObj = (activeIndex >= 0 && activeIndex < tocs.length - 1) ? tocs[activeIndex + 1] : null;

    // Page range of this section/chapter
    let startPg = activeTocObj ? activeTocObj.page_number : 1;
    let endPg = nextTocObj ? (nextTocObj.page_number - 1) : (lastPage || currentPg);
    if (endPg < startPg) endPg = startPg;

    // 1. Update the Sticky Current Reading Chapter Tracker Card
    if (el.tocCurrentTitle && activeTocObj) {
        el.tocCurrentTitle.textContent = activeTocObj.name;
    }
    if (el.tocCurrentPagePill) {
        el.tocCurrentPagePill.textContent = `စာမျက်နှာ ${toMyanmarNum(currentPg)}`;
    }
    if (el.tocCurrentRange) {
        if (startPg === endPg) {
            el.tocCurrentRange.textContent = `စာမျက်နှာ ${toMyanmarNum(startPg)} (ကျမ်းစာမျက်နှာ ${toMyanmarNum(currentPg)} / ${toMyanmarNum(lastPage || 381)})`;
        } else {
            el.tocCurrentRange.textContent = `စာမျက်နှာ ${toMyanmarNum(startPg)} မှ ${toMyanmarNum(endPg)} အထိ (ကျမ်းစာမျက်နှာ ${toMyanmarNum(currentPg)} / ${toMyanmarNum(lastPage || 381)})`;
        }
    }

    // 2. Update Mobile Chapter Breadcrumb
    if (el.mobileChapterBreadcrumb) {
        const bookName = (mode === "mm") ? (state.mmBookName || "မြန်မာပြန်") : (state.paliBookName || "ပါဠိတော်");
        const crumbBookId = (mode === "mm") ? state.mmBookId : state.paliBookId;
        if (el.mobileBreadcrumbBook) el.mobileBreadcrumbBook.textContent = withVolumeLabel(crumbBookId, bookName);
        if (el.mobileBreadcrumbChapter && activeTocObj) el.mobileBreadcrumbChapter.textContent = activeTocObj.name;
        if (el.mobileBreadcrumbPage) el.mobileBreadcrumbPage.textContent = `စာ-${toMyanmarNum(currentPg)}`;
        if (typeof updateReaderToolbarState === "function") updateReaderToolbarState();
    }

    // Auto-expand ancestors if active button is inside a collapsed parent
    if (activeIndex >= 0 && _currentTocNodesByIndex && _currentTocNodesByIndex[activeIndex]) {
        const activeNode = _currentTocNodesByIndex[activeIndex];
        let curr = activeNode.parent;
        let neededExpand = false;
        const bookKey = getTocBookKey();
        const expandedSet = _tocExpandedByBook.get(bookKey) || new Set();

        while (curr) {
            if (!expandedSet.has(curr.id)) {
                expandedSet.add(curr.id);
                neededExpand = true;
                const pWrapper = el.tocList.querySelector(`.toc-node-wrapper[data-node-id="${curr.id}"]`);
                if (pWrapper) {
                    const pBtn = pWrapper.querySelector(`.toc-toggle-btn[data-node-id="${curr.id}"]`);
                    const pChildren = pWrapper.querySelector(`#children-${curr.id}`);
                    if (pBtn) pBtn.classList.add("expanded");
                    if (pChildren) pChildren.style.display = "block";
                }
            }
            curr = curr.parent;
        }
        if (neededExpand) {
            _tocExpandedByBook.set(bookKey, expandedSet);
            rebuildTocBtnCache();
        }
    }

    // 3. Highlight the active button in the TOC list.
    let activeBtn = null;
    const foundEntry = _tocBtnCache.find(e => e.index === activeIndex);
    if (foundEntry) {
        activeBtn = foundEntry.btn;
    } else {
        for (const entry of _tocBtnCache) {
            if (entry.page <= currentPg) activeBtn = entry.btn;
        }
    }

    if (activeBtn !== _lastTocActiveBtn) {
        if (_lastTocActiveBtn) {
            _lastTocActiveBtn.classList.remove("active");
            const oldBadge = _lastTocActiveBtn.querySelector(".item-page-badge");
            if (oldBadge) oldBadge.textContent = `စာ-${_lastTocActiveBtn.getAttribute("data-page")}`;
        }
        if (activeBtn) activeBtn.classList.add("active");
        _lastTocActiveBtn = activeBtn;
    }

    if (activeBtn) {
        const badge = activeBtn.querySelector(".item-page-badge");
        if (badge) {
            badge.textContent = `စာ-${activeBtn.getAttribute("data-page")} (လက်ရှိ စာ-${toMyanmarNum(currentPg)})`;
        }
        if (shouldScroll) {
            activeBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    // 4. Update the Top Header chapter title
    if (activeTocObj && el.chapterTitleDisplay) {
        el.chapterTitleDisplay.textContent = activeTocObj.name;
    }

    // 5. Also sync Sutta tab if available
    highlightActiveSutta(currentPg);
}

function highlightActiveSutta(currentPg) {
    if (!el.suttaList) return;
    // O(1) DOM writes: only old + new buttons touched (cached scan, no DOM query).
    let activeSuttaBtn = null;
    for (const entry of _suttaBtnCache) {
        if (entry.page <= currentPg) activeSuttaBtn = entry.btn;
    }
    if (activeSuttaBtn !== _lastSuttaActiveBtn) {
        if (_lastSuttaActiveBtn) _lastSuttaActiveBtn.classList.remove("active");
        if (activeSuttaBtn) activeSuttaBtn.classList.add("active");
        _lastSuttaActiveBtn = activeSuttaBtn;
    }
}

function renderSuttas() {
    const filter = (el.suttaFilterInput.value || "").trim().toLowerCase();
    const suttas = (state.readerMode === "mm") ? state.mmSuttas : state.paliSuttas;
    const filtered = suttas.filter(s => !filter || s.name.toLowerCase().includes(filter) || (s.sutta_id && s.sutta_id.toLowerCase().includes(filter)));

    if (filtered.length === 0) {
        el.suttaList.innerHTML = `<div class="empty-state">ဤကျမ်းတွင် သုတ္တန်ခွဲများ မရှိပါ။</div>`;
        _suttaBtnCache = [];
        _lastSuttaActiveBtn = null;
        return;
    }

    let html = "";
    filtered.forEach(s => {
        html += `
            <button class="sutta-item-btn" data-page="${s.page_number}">
                <span class="sutta-item-title-wrapper">
                    <span class="toc-bullet-icon"></span>
                    <span>${escapeHtml(s.name)} ${s.sutta_id ? `(${escapeHtml(s.sutta_id)})` : ''}</span>
                </span>
                <span class="item-page-badge">စာ-${s.page_number}</span>
            </button>
        `;
    });
    el.suttaList.innerHTML = html;

    // Cache buttons for O(1) highlight updates (see highlightActiveSutta).
    _suttaBtnCache = [...el.suttaList.querySelectorAll(".sutta-item-btn")].map(btn => ({
        btn,
        page: parseInt(btn.getAttribute("data-page"), 10)
    }));
    _lastSuttaActiveBtn = null;

    el.suttaList.querySelectorAll(".sutta-item-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            clearPendingSearch();
            const p = parseInt(btn.getAttribute("data-page"), 10);
            if (state.readerMode === "mm") {
                loadMMPage(state.mmBookId, p);
            } else {
                loadPaliPage(state.paliBookId, p);
            }
            setAppView("reader");
            if (window.innerWidth <= 992) {
                closeSidebarMobile();
            } else {
                highlightActiveToc(p, false);
            }
        });
    });

    const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
    highlightActiveSutta(curPg);
}

// Resolve the page inside *targetBook* that corresponds to the reader's current
// position (Mūla ⇄ Aṭṭhakathā ⇄ Ṭīkā ⇄ မြန်မာပြန်). Returns null when the
// backend cannot match, so callers fall back to the book's first page.
async function matchCompanionPage(targetBookId, targetType) {
    if (!targetBookId) return null;
    const isMM = (state.readerMode === "mm");
    const srcBook = isMM ? state.mmBookId : state.paliBookId;
    const srcPage = isMM ? (state.mmPage || 1) : (state.paliPage || 1);
    if (!srcBook) return null;
    try {
        const url = `/api/match/pali_to_companion?source_book=${encodeURIComponent(srcBook)}&source_page=${srcPage}&target_type=${targetType}&target_book=${encodeURIComponent(targetBookId)}`;
        const res = await fetch(url);
        if (res.ok) {
            const m = await res.json();
            if (m && m.matched && m.target_book) {
                return { book: m.target_book, page: m.target_page || 1, para: m.matched_para || null };
            }
        }
    } catch (_) {}
    return null;
}

function renderRelatedDropdown() {
    const comp = state.companionData;
    const hasCompanions = comp && (
        (comp.attha && comp.attha.length > 0) ||
        (comp.tika && comp.tika.length > 0) ||
        (comp.mula && comp.mula.length > 0) ||
        (comp.mm && comp.mm.length > 0)
    );

    if (!hasCompanions && (!state.paliRelated || state.paliRelated.length === 0)) {
        if (el.relatedDropdownWrapper) el.relatedDropdownWrapper.style.display = "none";
        if (el.mobileCompanionRow) el.mobileCompanionRow.style.display = "none";
        return;
    }

    if (el.relatedDropdownWrapper) el.relatedDropdownWrapper.style.display = "block";
    if (el.mobileCompanionRow) el.mobileCompanionRow.style.display = "block";

    let html = "";

    // 1. အဋ္ဌကထာ (Commentary)
    if (comp && comp.attha && comp.attha.length > 0) {
        html += `
            <div class="comp-group">
                <div class="comp-group-label">
                    <span>📖 အဋ္ဌကထာ (Commentary)</span>
                    <span class="comp-group-badge">${toMyanmarNum(comp.attha.length)} အုပ်</span>
                </div>
        `;
        comp.attha.forEach(b => {
            html += `
                <div class="comp-card-item">
                    <div class="comp-card-header">
                        <span class="comp-card-title">${escapeHtml(b.name)}</span>
                    </div>
                    <div class="comp-card-actions">
                        <button class="comp-btn-split" data-comp-type="attha" data-id="${b.id}" title="လက်ရှိကျမ်းစာနှင့် ယှဉ်တွဲဖတ်ရှုရန်">
                            <span>📖 ယှဉ်တွဲဖတ်မည်</span>
                        </button>
                        <button class="comp-btn-goto" data-id="${b.id}" title="ဤကျမ်းစာအုပ်သို့ တိုက်ရိုက်ကူးပြောင်းရန်">
                            <span>➔ ဖတ်မည်</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // 2. ဋီကာ (Sub-commentary)
    if (comp && comp.tika && comp.tika.length > 0) {
        html += `
            <div class="comp-group">
                <div class="comp-group-label">
                    <span>📜 ဋီကာ (Sub-commentary)</span>
                    <span class="comp-group-badge">${toMyanmarNum(comp.tika.length)} အုပ်</span>
                </div>
        `;
        comp.tika.forEach(b => {
            html += `
                <div class="comp-card-item">
                    <div class="comp-card-header">
                        <span class="comp-card-title">${escapeHtml(b.name)}</span>
                    </div>
                    <div class="comp-card-actions">
                        <button class="comp-btn-split" data-comp-type="tika" data-id="${b.id}" title="လက်ရှိကျမ်းစာနှင့် ယှဉ်တွဲဖတ်ရှုရန်">
                            <span>📖 ယှဉ်တွဲဖတ်မည်</span>
                        </button>
                        <button class="comp-btn-goto" data-id="${b.id}" title="ဤကျမ်းစာအုပ်သို့ တိုက်ရိုက်ကူးပြောင်းရန်">
                            <span>➔ ဖတ်မည်</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // 3. ပါဠိတော်မူလ (Mūla - when on Attha/Tika)
    if (comp && comp.mula && comp.mula.length > 0) {
        html += `
            <div class="comp-group">
                <div class="comp-group-label">
                    <span>☸️ မူလပါဠိတော်</span>
                    <span class="comp-group-badge">${toMyanmarNum(comp.mula.length)} အုပ်</span>
                </div>
        `;
        comp.mula.forEach(b => {
            html += `
                <div class="comp-card-item">
                    <div class="comp-card-header">
                        <span class="comp-card-title">${escapeHtml(b.name)}</span>
                    </div>
                    <div class="comp-card-actions">
                        <button class="comp-btn-split" data-comp-type="mula" data-id="${b.id}" title="လက်ရှိကျမ်းစာနှင့် ယှဉ်တွဲဖတ်ရှုရန်">
                            <span>📖 ယှဉ်တွဲဖတ်မည်</span>
                        </button>
                        <button class="comp-btn-goto" data-id="${b.id}" title="ဤကျမ်းစာအုပ်သို့ တိုက်ရိုက်ကူးပြောင်းရန်">
                            <span>➔ ဖတ်မည်</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // 4. မြန်မာပြန် (Translation)
    if (comp && comp.mm && comp.mm.length > 0) {
        html += `
            <div class="comp-group">
                <div class="comp-group-label">
                    <span>🇲🇲 မြန်မာပြန်</span>
                    <span class="comp-group-badge">${toMyanmarNum(comp.mm.length)} အုပ်</span>
                </div>
        `;
        comp.mm.forEach(b => {
            html += `
                <div class="comp-card-item">
                    <div class="comp-card-header">
                        <span class="comp-card-title">${escapeHtml(b.name)}</span>
                    </div>
                    <div class="comp-card-actions">
                        <button class="comp-btn-split" data-comp-type="mm" data-id="${b.id}" title="လက်ရှိကျမ်းစာနှင့် ယှဉ်တွဲဖတ်ရှုရန်">
                            <span>📖 ယှဉ်တွဲဖတ်မည်</span>
                        </button>
                        <button class="comp-btn-goto-mm" data-id="${b.id}" title="မြန်မာပြန်ကျမ်းစာသို့ တိုက်ရိုက်ကူးပြောင်းရန်">
                            <span>➔ ဖတ်မည်</span>
                        </button>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }

    // Fallback if only legacy related items
    if (!html && state.paliRelated && state.paliRelated.length > 0) {
        state.paliRelated.forEach(r => {
            const label = r.rel_type === "root" ? "ပါဠိတော်မူလ" : "အဋ္ဌကထာ/ဋီကာ";
            html += `
                <div class="comp-card-item">
                    <div class="comp-card-header">
                        <span class="comp-card-title">${escapeHtml(r.name)}</span>
                        <small style="color:var(--text-muted);">${label}</small>
                    </div>
                    <div class="comp-card-actions">
                        <button class="comp-btn-split" data-comp-type="attha" data-id="${r.id}">
                            <span>📖 ယှဉ်တွဲဖတ်မည်</span>
                        </button>
                        <button class="comp-btn-goto" data-id="${r.id}">
                            <span>➔ ဖတ်မည်</span>
                        </button>
                    </div>
                </div>
            `;
        });
    }

    el.relatedList.innerHTML = html;

    // Attach click events
    el.relatedList.querySelectorAll(".comp-btn-split").forEach(btn => {
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            const compType = btn.getAttribute("data-comp-type") || "attha";
            const compId = btn.getAttribute("data-id");
            if (el.relatedDropdownWrapper) el.relatedDropdownWrapper.classList.remove("open");
            openSplitCompanion(compType, compId);
        });
    });

    el.relatedList.querySelectorAll(".comp-btn-goto").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const relId = btn.getAttribute("data-id");
            if (el.relatedDropdownWrapper) el.relatedDropdownWrapper.classList.remove("open");
            // Land on the matching page (e.g. Atthakathā p.103 ⇒ Mūla p.150)
            // instead of dumping the reader back at page 1.
            const target = await matchCompanionPage(relId, "pali");
            loadPaliBook(relId, target ? target.page : null);
        });
    });

    el.relatedList.querySelectorAll(".comp-btn-goto-mm").forEach(btn => {
        btn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const mmId = btn.getAttribute("data-id");
            if (el.relatedDropdownWrapper) el.relatedDropdownWrapper.classList.remove("open");
            const target = await matchCompanionPage(mmId, "mm");
            setReaderMode("mm");
            loadMMBook(mmId, target ? target.page : 1);
        });
    });
}

// ----------------- BookmarkManager -----------------
// Bookmarks live in localStorage (private per browser) and sync across the
// user's paired devices through the existing /api/sync history channel with
// kind="bookmark". This replaces the old global server-side bookmark table,
// where every visitor shared (and could delete) everyone else's bookmarks.
const BookmarkManager = {
    KEY: "tipitaka_bookmarks_v1",

    _readRaw() {
        try {
            const raw = localStorage.getItem(this.KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) { return []; }
    },

    save(list) {
        try { localStorage.setItem(this.KEY, JSON.stringify(list)); }
        catch (e) { console.error("Bookmark save failed:", e); }
    },

    _id(bookId, page) { return "bm_" + String(bookId) + "_" + String(page); },

    getAll() {
        return this._readRaw().filter(b => b && !b.deleted);
    },

    isBookmarked(bookId, page) {
        return this._readRaw().some(b => b && !b.deleted && b.bookId === bookId && Number(b.page) === Number(page));
    },

    add({ bookId, bookName, page, note, mode }) {
        const list = this._readRaw();
        const id = this._id(bookId, page);
        const now = Date.now();
        let item = list.find(b => b.id === id);
        if (item) {
            if (item.deleted) item.deleted = 0;
            if (bookName) item.bookName = String(bookName).substring(0, 120);
            item.note = String(note !== undefined ? note : (item.note || "")).substring(0, 500);
            item.mode = String(mode || item.mode || "pali").substring(0, 16);
            item.updatedAt = now;
        } else {
            item = {
                id, kind: "bookmark",
                bookId: String(bookId || ""), bookName: String(bookName || "").substring(0, 120),
                page: Number(page) || 0, note: String(note || "").substring(0, 500),
                mode: String(mode || "pali").substring(0, 16),
                timestamp: now, updatedAt: now, deleted: 0
            };
            list.unshift(item);
        }
        this.save(list);
        return item;
    },

    // Tombstone delete — the deletion propagates to paired devices via sync
    remove(bookId, page) {
        const list = this._readRaw();
        const it = list.find(b => b.id === this._id(bookId, page));
        if (it && !it.deleted) {
            it.deleted = 1;
            it.updatedAt = Date.now();
            this.save(list);
        }
    },

    toggle({ bookId, bookName, page, mode }) {
        if (this.isBookmarked(bookId, page)) { this.remove(bookId, page); return false; }
        this.add({ bookId, bookName, page, mode });
        return true;
    },

    // Rows (incl. tombstones) changed since ts — merged into the history payload
    changedSince(ts) {
        return this._readRaw().filter(b => (Number(b.updatedAt) || 0) > (ts || 0));
    },

    // Merge remote bookmark rows, last-write-wins per id. Returns true if changed.
    mergeRemote(remoteList) {
        if (!Array.isArray(remoteList) || remoteList.length === 0) return false;
        const list = this._readRaw();
        const byId = new Map(list.map(b => [b.id, b]));
        let changed = false;
        for (const r of remoteList) {
            if (!r || typeof r.id !== "string" || !r.id) continue;
            const rUpd = Number(r.updatedAt) || 0;
            const local = byId.get(r.id);
            if (!local) {
                byId.set(r.id, { ...r, kind: "bookmark", updatedAt: rUpd });
                changed = true;
            } else if (rUpd > (Number(local.updatedAt) || 0)) {
                byId.set(r.id, { ...local, ...r, kind: "bookmark", updatedAt: rUpd });
                changed = true;
            }
        }
        if (changed) {
            // Prune ancient tombstones locally (server prunes them too)
            const now = Date.now(), PRUNE_MS = 90 * 24 * 3600 * 1000;
            this.save([...byId.values()].filter(b =>
                !(b.deleted && (now - (Number(b.updatedAt) || 0)) > PRUNE_MS)));
        }
        return changed;
    },

    // NOTE: the legacy global /api/bookmarks table is intentionally NOT imported.
    // It was shared across all visitors (no per-user separation), so auto-import
    // would copy strangers' bookmarks into every browser. Rows are preserved
    // server-side for manual recovery; the per-device BookmarkManager + sync
    // channel is the source of truth going forward.
};

// ----------------- Bookmarks -----------------

async function loadBookmarks() {
    try {
        state.bookmarks = BookmarkManager.getAll();
        renderBookmarksList();
        updateBookmarkIconStatus();
    } catch (err) {
        console.error("Failed to load bookmarks:", err);
    }
}

function renderBookmarksList() {
    if (!state.bookmarks || state.bookmarks.length === 0) {
        el.bookmarksList.innerHTML = `<div class="empty-state">မှတ်သားထားသော စာမျက်နှာ မရှိသေးပါ။</div>`;
        return;
    }
    let html = "";
    state.bookmarks.forEach(bm => {
        // Escape everything user-controlled (names/notes sync across devices —
        // unescaped HTML here would be a stored-XSS vector).
        const bid = escapeHtml(bm.bookId), bname = escapeHtml(bm.bookName || bm.bookId);
        html += `
            <div class="bookmark-item-btn" data-id="${bid}" data-page="${bm.page}">
                <div style="flex:1;">
                    <strong>${bname}</strong>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">စာမျက်နှာ - ${bm.page}</div>
                    ${bm.note ? `<div style="font-size:0.75rem;color:var(--text-muted);">${escapeHtml(bm.note)}</div>` : ''}
                </div>
                <button class="icon-btn-sm btn-delete-bm" data-id="${bid}" data-page="${bm.page}" title="ဖျက်ရန်">&times;</button>
            </div>
        `;
    });
    el.bookmarksList.innerHTML = html;

    el.bookmarksList.querySelectorAll(".bookmark-item-btn").forEach(item => {
        item.addEventListener("click", async (e) => {
            if (e.target.classList.contains("btn-delete-bm")) return;
            clearPendingSearch();
            const bid = item.getAttribute("data-id");
            const page = parseInt(item.getAttribute("data-page"), 10);
            await loadPaliBook(bid, page);
            setAppView("reader");
            if (window.innerWidth > 992) {
                switchToSidebarTab("tab-toc");
                highlightActiveToc(page, true);
            } else {
                closeSidebarMobile();
            }
        });
    });

    el.bookmarksList.querySelectorAll(".btn-delete-bm").forEach(delBtn => {
        delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            BookmarkManager.remove(delBtn.getAttribute("data-id"), parseInt(delBtn.getAttribute("data-page"), 10));
            if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
            loadBookmarks();
        });
    });
}

function updateBookmarkIconStatus() {
    try {
        const isBookmarked = BookmarkManager.isBookmarked(state.paliBookId, state.paliPage);
        if (el.bookmarkIcon) {
            el.bookmarkIcon.setAttribute("fill", isBookmarked ? "currentColor" : "none");
        }
        if (el.btnBookmarkToggle) {
            el.btnBookmarkToggle.style.color = isBookmarked ? "var(--accent)" : "";
        }
    } catch (e) {
        console.warn("updateBookmarkIconStatus error:", e);
    }
}

function toggleCurrentBookmark() {
    BookmarkManager.toggle({
        bookId: state.paliBookId,
        bookName: state.paliBookName || state.paliBookId,
        page: state.paliPage,
        mode: "pali"
    });
    if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
    loadBookmarks();
}

// ----------------- Security Utility: HTML Escaping -----------------
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ----------------- Interactive Dictionary -----------------

// Monotonic tokens guard against stale async responses overwriting newer ones
// (e.g. a slow dict lookup for word A arriving after a fast lookup for word B).
let _dictLookupSeq = 0;
let _searchSeq = 0;

async function lookupDictionary(word, triggerPopover = false, clickX = 0, clickY = 0) {
    if (!word) return;
    const seq = ++_dictLookupSeq;
    if (!state.isDictOpen && !triggerPopover) toggleDictSidebar(true);

    el.dictContent.innerHTML = `
        <div class="loading-state">
            <div>အဘိဓာန် ရှာဖွေနေပါသည်...</div>
            <strong style="color:var(--accent); font-size:1.1rem; margin-top:8px; display:inline-block;">${escapeHtml(word)}</strong>
        </div>
    `;

    try {
        const res = await fetch(`/api/dictionary/lookup?word=${encodeURIComponent(word)}`);
        if (!res.ok) throw new Error(`Dict lookup failed (HTTP ${res.status})`);
        const data = await res.json();
        if (seq !== _dictLookupSeq) return; // stale response — a newer lookup is in flight

        if (!triggerPopover && (data.clean_word || word)) {
            HistoryManager.recordSearch(data.clean_word || word, "dict", data.results ? data.results.length : 0);
        }

        if (!data.results || data.results.length === 0) {
            el.dictContent.innerHTML = `
                <div class="dict-result-header">
                    <div class="dict-result-word">${escapeHtml(data.clean_word || word)}</div>
                </div>
                <div class="empty-state">ဤစကားလုံးအတွက် အဘိဓာန် အဓိပ္ပာယ် မတွေ့ရှိပါ။</div>
            `;
            return;
        }

        const isStemmed = data.clean_word !== data.matched_word;
        let html = `
            <div class="dict-result-header">
                <div class="dict-result-word">${escapeHtml(data.matched_word)}</div>
                ${isStemmed ? `<div class="dict-stem-hint">မူလစာလုံး '${escapeHtml(data.clean_word)}' မှ ဝိဘတ်ဖြုတ်၍ တွေ့ရှိသောအနက်</div>` : ''}
            </div>
        `;

        data.results.forEach(item => {
            html += `
                <div class="dict-entry-card">
                    <span class="dict-book-badge">${escapeHtml(item.book_name)}</span>
                    <div class="dict-def-body">${item.definition}</div>
                </div>
            `;
        });

        el.dictContent.innerHTML = html;
        el.dictSearchInput.value = data.clean_word;

        if (triggerPopover) {
            showQuickPopover(data.matched_word, data.results[0].definition, clickX, clickY);
        }

    } catch (err) {
        console.error("Dict lookup error:", err);
        if (seq !== _dictLookupSeq) return; // stale — don't overwrite newer result with an error
        el.dictContent.innerHTML = `<div class="empty-state">အဘိဓာန် ရှာဖွေရာတွင် အမှားဖြစ်ပေါ်ပါသည်- ${escapeHtml(err.message)}</div>`;
    }
}

function showQuickPopover(word, defHtml, x, y) {
    el.popoverWord.textContent = word;
    el.popoverBody.innerHTML = defHtml;
    const pop = el.dictQuickPopover;
    pop.style.display = "block";
    if (window.innerWidth > 768) {
        const popWidth = 280;
        const popHeight = 180;
        let left = x - 50;
        let top = y + 20;
        if (left + popWidth > window.innerWidth) left = window.innerWidth - popWidth - 16;
        if (left < 10) left = 10;
        if (top + popHeight > window.innerHeight) top = y - popHeight - 10;
        pop.style.left = `${left}px`;
        pop.style.top = `${top}px`;
    } else {
        pop.style.left = "";
        pop.style.top = "";
    }
}

// ----------------- Universal Search -----------------

let searchDebounceTimer = null;

function highlightSnippet(snippet, query) {
    if (!snippet) return "";
    let safe = escapeHtml(snippet);
    if (!query) return safe;
    const cleanQ = query.trim();
    if (!cleanQ) return safe;
    const words = cleanQ.split(/\s+/).filter(Boolean);
    if (!words.length) return safe;

    // Try exact phrase match first
    const safePhrase = escapeHtml(cleanQ);
    const regPhrase = new RegExp(`(${safePhrase.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")})`, "gi");
    if (regPhrase.test(safe)) {
        return safe.replace(regPhrase, `<mark class="search-highlight">$1</mark>`);
    }

    // Otherwise highlight individual words (longer words first to avoid subword overlap)
    const sortedWords = [...words].sort((a, b) => b.length - a.length);
    sortedWords.forEach(w => {
        const sw = escapeHtml(w);
        if (sw.length < 2) return;
        const rw = new RegExp(`(${sw.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")})`, "gi");
        safe = safe.replace(rw, `<mark class="search-highlight">$1</mark>`);
    });
    return safe;
}

async function performSearch() {
    const q = el.globalSearchInput.value.trim();
    if (!q) {
        el.searchResultsList.innerHTML = `<div class="search-hint"><p>💡 ရှာဖွေလိုသော စာလုံး ရိုက်ထည့်ပါ...</p></div>`;
        el.searchSummary.style.display = "none";
        return;
    }
    const seq = ++_searchSeq;

    el.searchResultsList.innerHTML = `<div class="loading-state">ရှာဖွေနေပါသည်...</div>`;
    el.searchSummary.style.display = "none";

    try {
        let searchUrl = `/api/search?q=${encodeURIComponent(q)}&type=${state.searchMode}&limit=30`;
        if (state.searchBookScope === "current") {
            const scopedBookId = currentSearchBookId();
            if (scopedBookId) searchUrl += `&book=${encodeURIComponent(scopedBookId)}`;
        }
        const res = await fetch(searchUrl);
        if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
        const data = await res.json();
        if (seq !== _searchSeq) return; // stale response — a newer search is in flight

        if (data.total === 0 || !data.results || data.results.length === 0) {
            el.searchResultsList.innerHTML = `<div class="empty-state">ရှာဖွေမှုရလဒ် မတွေ့ရှိပါ။</div>`;
            return;
        }

        HistoryManager.recordSearch(q, state.searchMode, data.total);

        el.searchSummary.style.display = "block";
        if (state.searchMode === "word" && data.type !== "phrase") {
            const occ = data.total_occurrences || data.total || 0;
            el.searchSummary.innerHTML = `တွေ့ရှိမှု စုစုပေါင်း <strong>${occ.toLocaleString()}</strong> ကြိမ် (စာမျက်နှာ <strong>${data.total.toLocaleString()}</strong> မျက်နှာ)`;
        } else if (state.searchMode === "phrase" || data.type === "phrase" || state.searchMode === "mm_phrase" || data.type === "mm_phrase") {
            el.searchSummary.innerHTML = `တွေ့ရှိသော စာမျက်နှာ စုစုပေါင်း <strong>${data.total.toLocaleString()}</strong> မျက်နှာ`;
        } else {
            el.searchSummary.innerHTML = `တွေ့ရှိမှု စုစုပေါင်း <strong>${data.total.toLocaleString()}</strong> ခု`;
        }

        if (state.searchBookScope === "current" && currentSearchBookId()) {
            el.searchSummary.innerHTML += ` — ${escapeHtml(currentSearchBookName())} အတွင်း`;
        }

        let html = "";
        data.results.forEach(r => {
            if (state.searchMode === "word" || state.searchMode === "phrase" || data.type === "phrase") {
                const highlighted = highlightSnippet(r.snippet, q);
                html += `
                    <div class="search-result-item" data-type="pali" data-bid="${escapeHtml(r.book_id)}" data-page="${r.page}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.book_name)}</span>
                            <span class="res-page">စာမျက်နှာ - ${r.page}</span>
                        </div>
                        <div class="res-snippet">${highlighted}</div>
                    </div>
                `;
            } else if (state.searchMode === "mm_phrase" || data.type === "mm_phrase") {
                const highlighted = highlightSnippet(r.snippet, q);
                html += `
                    <div class="search-result-item" data-type="mm" data-bid="${escapeHtml(r.book_id)}" data-page="${r.page}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.book_name)}</span>
                            <span class="res-page">စာမျက်နှာ - ${r.page}</span>
                        </div>
                        <div class="res-snippet">${highlighted}</div>
                    </div>
                `;
            } else if (state.searchMode === "sutta") {
                html += `
                    <div class="search-result-item" data-type="pali" data-bid="${escapeHtml(r.book_id)}" data-page="${r.page_number}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.name)} ${r.sutta_id ? `(${escapeHtml(r.sutta_id)})` : ''}</span>
                            <span class="res-page">${escapeHtml(r.book_name)} • စာ-${r.page_number}</span>
                        </div>
                    </div>
                `;
            } else if (state.searchMode === "book") {
                html += `
                    <div class="search-result-item" data-type="pali" data-bid="${escapeHtml(r.id)}" data-page="${r.firstpage}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.name)}</span>
                            <span class="res-page">${escapeHtml(r.category_name || '')} • ${r.pagecount} မျက်နှာ</span>
                        </div>
                    </div>
                `;
            } else if (state.searchMode === "mm_book") {
                html += `
                    <div class="search-result-item" data-type="mm" data-bid="${escapeHtml(r.id)}" data-page="${r.first_page}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.name)}</span>
                            <span class="res-page">${escapeHtml(r.category_name || '')} • ${r.page_count} မျက်နှာ</span>
                        </div>
                    </div>
                `;
            } else if (state.searchMode === "mm_toc") {
                html += `
                    <div class="search-result-item" data-type="mm" data-bid="${escapeHtml(r.book_id)}" data-page="${r.page_number}">
                        <div class="res-header">
                            <span class="res-book">${escapeHtml(r.name)}</span>
                            <span class="res-page">${escapeHtml(r.book_name)} • စာ-${r.page_number}</span>
                        </div>
                    </div>
                `;
            } else if (state.searchMode === "nissaya" || data.type === "nissaya") {
                const paraText = r.paragraph_number ? `စာပိုဒ် ${toMyanmarNum(r.paragraph_number)}` : "";
                const pageText = `စာ-${toMyanmarNum(r.page_number)}`;
                html += `
                    <div class="search-result-item nissaya-search-item" data-type="nissaya" data-bid="${escapeHtml(r.book_id)}" data-page="${r.page_number}" data-para="${r.paragraph_number || ''}">
                        <div class="res-header">
                            <span class="res-book">📜 ${escapeHtml(r.book_name)}</span>
                            <span class="res-page">${pageText}${paraText ? ' • ' + paraText : ''}</span>
                        </div>
                        <div class="res-snippet">${r.snippet ? String(r.snippet).replace(/[<>&"']/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c])).replace(/&lt;(\/?)mark&gt;/g, '<$1mark>') : escapeHtml(r.gloss || '')}</div>
                    </div>
                `;
            }
        });

        // Event delegation is handled once on el.searchResultsList
        el.searchResultsList.innerHTML = html;

    } catch (err) {
        console.error("Search error:", err);
        if (seq !== _searchSeq) return; // stale — don't overwrite newer results with an error
        el.searchResultsList.innerHTML = `<div class="empty-state">ရှာဖွေရာတွင် အမှားဖြစ်ပေါ်ပါသည်: ${escapeHtml(err.message)}</div>`;
    }
}

// Current-book search scope: "လက်ရှိကျမ်း" limits text search to the book now open.
// The book follows the search mode (its data source), not the reader pane:
// Pali modes use the Pali book, Myanmar modes use the Myanmar book.
const BOOK_SEARCH_MODES = ["word", "phrase", "sutta", "nissaya", "mm_phrase", "mm_toc"];
function currentSearchBookId() {
    if (state.searchMode === "mm_phrase" || state.searchMode === "mm_toc") return state.mmBookId;
    return state.paliBookId;
}
function currentSearchBookName() {
    if (state.searchMode === "mm_phrase" || state.searchMode === "mm_toc") return state.mmBookName || "မြန်မာပြန်";
    return state.paliBookName || "ပါဠိတော်";
}
function defaultSearchPlaceholder() {
    if (state.searchMode === "nissaya") return "မြန်မာနိဿယ စကားပြေအနက်များအတွင်း ရှာဖွေလိုသော စာလုံး ရိုက်ထည့်ပါ...";
    if (state.searchScope === "pali") return "ပါဠိတော် ကျမ်းစာများအတွင်း ရှာဖွေလိုသော စာလုံး ရိုက်ထည့်ပါ...";
    return "မြန်မာပြန် ကျမ်းစာများအတွင်း ရှာဖွေလိုသော စာလုံး ရိုက်ထည့်ပါ...";
}
function refreshBookScopeUI() {
    const show = BOOK_SEARCH_MODES.includes(state.searchMode);
    if (el.bookScopeBar) el.bookScopeBar.style.display = show ? "flex" : "none";
    if (!show) return;
    const bookId = currentSearchBookId();
    const bookName = currentSearchBookName();
    const hasBook = !!bookId;
    if (state.searchBookScope === "current" && !hasBook) state.searchBookScope = "all";
    if (el.currentBookName) el.currentBookName.textContent = bookName;
    if (el.bookScopeAllBtn) el.bookScopeAllBtn.classList.toggle("active", state.searchBookScope === "all");
    if (el.bookScopeCurrentBtn) {
        el.bookScopeCurrentBtn.disabled = !hasBook;
        el.bookScopeCurrentBtn.classList.toggle("active", state.searchBookScope === "current");
    }
    if (el.globalSearchInput) {
        el.globalSearchInput.placeholder = (state.searchBookScope === "current" && hasBook)
            ? "လက်ရှိကျမ်း (" + bookName + ") အတွင်း ရှာဖွေလိုသော စာလုံး ရိုက်ထည့်ပါ..."
            : defaultSearchPlaceholder();
    }
}
function setBookScope(scope) {
    state.searchBookScope = scope;
    refreshBookScopeUI();
    if (el.globalSearchInput && el.globalSearchInput.value.trim()) performSearch();
}

function setSearchScope(scope, targetMode = null) {
    state.searchScope = scope;
    if (el.scopeBtnPali) el.scopeBtnPali.classList.toggle("active", scope === "pali");
    if (el.scopeBtnMM) el.scopeBtnMM.classList.toggle("active", scope === "mm");
    if (el.paliTabsGroup) el.paliTabsGroup.style.display = (scope === "pali") ? "flex" : "none";
    if (el.mmTabsGroup) el.mmTabsGroup.style.display = (scope === "mm") ? "flex" : "none";

    const paliModes = ["word", "phrase", "sutta", "book", "nissaya"];
    const mmModes = ["mm_phrase", "mm_book", "mm_toc", "nissaya"];

    if (targetMode) {
        state.searchMode = targetMode;
    } else {
        if (scope === "pali" && !paliModes.includes(state.searchMode)) {
            state.searchMode = "word";
        } else if (scope === "mm" && !mmModes.includes(state.searchMode)) {
            state.searchMode = "mm_phrase";
        }
    }

    if (el.modalTabBtns) {
        el.modalTabBtns.forEach(btn => {
            btn.classList.toggle("active", btn.getAttribute("data-mode") === state.searchMode);
        });
    }

    if (el.globalSearchInput) {
        el.globalSearchInput.placeholder = defaultSearchPlaceholder();
    }
    refreshBookScopeUI();
}

function openSearchModal() {
    el.searchModal.classList.add("open");
    const isMMMode = state.searchMode && state.searchMode.startsWith("mm_");
    const isMMReader = state.readerMode === "mm";
    const preferredScope = isMMMode ? "mm" : (state.searchMode && ["word", "phrase", "sutta", "book", "nissaya"].includes(state.searchMode) ? (state.searchScope || (isMMReader ? "mm" : "pali")) : (isMMReader ? "mm" : "pali"));
    setSearchScope(preferredScope, state.searchMode);
    el.globalSearchInput.focus();
}

function closeSearchModal() {
    el.searchModal.classList.remove("open");
}

// ----------------- Comprehensive History System (LocalStorage) -----------------

function getCurrentChapterName(mode, pageNum) {
    const tocs = (mode === "mm") ? state.mmTocs : state.paliTocs;
    if (tocs && tocs.length > 0) {
        let found = null;
        for (const t of tocs) {
            if (t.page_number <= pageNum) {
                found = t.name;
            } else {
                break;
            }
        }
        if (found) return found;
    }
    if (el.chapterTitleDisplay && el.chapterTitleDisplay.textContent) {
        const txt = el.chapterTitleDisplay.textContent.trim();
        if (txt && !txt.includes("ယှဉ်တွဲဖတ်ရှုခြင်း") && !txt.includes("ဖွင့်လှစ်နေပါသည်")) {
            return txt;
        }
    }
    return "";
}

function formatHistoryTime(timestamp) {
    if (!timestamp) return "";
    const diffMs = Date.now() - timestamp;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);

    if (diffMin < 1) return "လောလောလတ်လတ်";
    if (diffMin < 60) return `${toMyanmarNum(diffMin)} မိနစ်ခန့်က`;
    if (diffHour < 24) {
        const d = new Date(timestamp);
        const hours = d.getHours();
        const mins = String(d.getMinutes()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";
        const h12 = hours % 12 || 12;
        return `${toMyanmarNum(h12)}:${toMyanmarNum(mins)} ${ampm}`;
    }
    const d = new Date(timestamp);
    const day = toMyanmarNum(d.getDate());
    const month = toMyanmarNum(d.getMonth() + 1);
    const year = toMyanmarNum(d.getFullYear());
    return `${day}/${month}/${year}`;
}

function groupHistoryByDate(items) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const yesterdayStart = todayStart - 86400000;
    const pastWeekStart = todayStart - (7 * 86400000);
    const pastMonthStart = todayStart - (30 * 86400000);

    const groups = [
        { label: "📅 ယနေ့ (Today)", items: [] },
        { label: "📅 မနေ့က (Yesterday)", items: [] },
        { label: "📅 လွန်ခဲ့သော ၇ ရက်အတွင်း", items: [] },
        { label: "📅 လွန်ခဲ့သော ရက် ၃၀ အတွင်း", items: [] },
        { label: "📅 ယခင်လများက (Earlier)", items: [] }
    ];

    items.forEach(item => {
        const t = item.timestamp || 0;
        if (t >= todayStart) {
            groups[0].items.push(item);
        } else if (t >= yesterdayStart) {
            groups[1].items.push(item);
        } else if (t >= pastWeekStart) {
            groups[2].items.push(item);
        } else if (t >= pastMonthStart) {
            groups[3].items.push(item);
        } else {
            groups[4].items.push(item);
        }
    });

    return groups.filter(g => g.items.length > 0);
}

const HistoryManager = {
    READING_KEY: "tipitaka_reading_history_v1",
    SEARCH_KEY: "tipitaka_search_history_v1",
    MAX_READING: 200,
    MAX_SEARCH: 50,
    TOMBSTONE_PRUNE_MS: 90 * 24 * 3600 * 1000, // 90 days, mirrors server

    // Raw storage readers (include sync tombstones)
    _readRawReading() {
        try {
            const raw = localStorage.getItem(this.READING_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            console.error("Failed to parse reading history:", e);
            return [];
        }
    },
    _readRawSearch() {
        try {
            const raw = localStorage.getItem(this.SEARCH_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch (e) {
            return [];
        }
    },

    getReadingHistory() {
        return this._readRawReading().filter(i => !i.deleted);
    },

    getSearchHistory() {
        return this._readRawSearch().filter(i => !i.deleted);
    },

    _pruneTombstones(list) {
        const now = Date.now();
        return list.filter(i => !i.deleted ||
            (now - (Number(i.updatedAt) || Number(i.timestamp) || 0)) <= this.TOMBSTONE_PRUNE_MS);
    },

    saveReadingHistory(list) {
        try {
            const pruned = this._pruneTombstones(list);
            const active = pruned.filter(i => !i.deleted).slice(0, this.MAX_READING);
            const tombs = pruned.filter(i => i.deleted);
            localStorage.setItem(this.READING_KEY, JSON.stringify(active.concat(tombs)));
            this.updateBadgeCounts();
        } catch (e) {
            console.error("Failed to save reading history:", e);
        }
    },

    recordReading(entry) {
        if (!entry || !entry.bookId) return;
        const raw = this._readRawReading();
        const list = raw.filter(i => !i.deleted);
        const now = Date.now();

        // If top item is identical book and mode, update page, chapter and timestamp
        if (list.length > 0) {
            const first = list[0];
            const isSameBook = (first.mode === entry.mode) && (first.bookId === entry.bookId);
            const isRecent = (now - (first.timestamp || 0)) < 3600000; // 1 hour session
            if (isSameBook && isRecent) {
                first.page = entry.page;
                if (entry.chapterName) first.chapterName = entry.chapterName;
                if (entry.bookName && (!first.bookName || first.bookName === entry.bookId)) first.bookName = entry.bookName;
                if (entry.mode === "split") {
                    if (entry.splitMMBookId) first.splitMMBookId = entry.splitMMBookId;
                    if (entry.splitMMBookName) first.splitMMBookName = entry.splitMMBookName;
                    if (entry.splitMMPage) first.splitMMPage = entry.splitMMPage;
                }
                first.timestamp = now;
                first.updatedAt = now;
                this.saveReadingHistory(raw);
                if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
                return;
            }
        }

        const newItem = {
            id: "rh_" + now + "_" + Math.random().toString(36).substring(2, 6),
            mode: entry.mode || "pali",
            bookId: entry.bookId,
            bookName: entry.bookName || entry.bookId,
            page: entry.page || 1,
            chapterName: entry.chapterName || "",
            splitMMBookId: entry.splitMMBookId || null,
            splitMMBookName: entry.splitMMBookName || null,
            splitMMPage: entry.splitMMPage || null,
            timestamp: now,
            updatedAt: now
        };

        // Tombstone any identical prior entry for same book & page, so the
        // replacement propagates to other devices instead of duplicating there
        for (const item of list) {
            if (item.mode === newItem.mode && item.bookId === newItem.bookId && item.page === newItem.page) {
                item.deleted = 1;
                item.updatedAt = now;
            }
        }
        const filtered = list.filter(item => !item.deleted);
        filtered.unshift(newItem);
        this.saveReadingHistory(filtered.concat(raw.filter(i => i.deleted)));
        if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
    },

    // Tombstone delete (sync-friendly: deletions propagate to other devices)
    deleteReadingItem(id) {
        const raw = this._readRawReading();
        const it = raw.find(item => item.id === id);
        if (it) {
            it.deleted = 1;
            it.updatedAt = Date.now();
            this.saveReadingHistory(raw);
            if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
        }
    },

    clearReadingHistory() {
        const raw = this._readRawReading();
        const now = Date.now();
        raw.forEach(item => { item.deleted = 1; item.updatedAt = now; });
        this.saveReadingHistory(raw);
        if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
    },

    saveSearchHistory(list) {
        try {
            const pruned = this._pruneTombstones(list);
            const active = pruned.filter(i => !i.deleted).slice(0, this.MAX_SEARCH);
            const tombs = pruned.filter(i => i.deleted);
            localStorage.setItem(this.SEARCH_KEY, JSON.stringify(active.concat(tombs)));
            this.updateBadgeCounts();
        } catch (e) {}
    },

    recordSearch(query, type, resultCount = null) {
        const q = (query || "").trim();
        if (!q || q.length < 2) return;
        const raw = this._readRawSearch();
        const now = Date.now();
        // Tombstone prior entries with the same query so the replacement
        // propagates to other devices instead of duplicating there
        for (const item of raw) {
            if (!item.deleted && item.query.toLowerCase() === q.toLowerCase()) {
                item.deleted = 1;
                item.updatedAt = now;
            }
        }
        const list = raw.filter(i => !i.deleted);
        list.unshift({
            id: "sh_" + now,
            query: q,
            type: type || "word",
            resultCount: (resultCount !== null && resultCount !== undefined) ? resultCount : null,
            timestamp: now,
            updatedAt: now
        });
        this.saveSearchHistory(list.concat(raw.filter(i => i.deleted)));
        if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
    },

    // Tombstone delete (sync-friendly: deletions propagate to other devices)
    deleteSearchItem(id) {
        const raw = this._readRawSearch();
        const it = raw.find(item => item.id === id);
        if (it) {
            it.deleted = 1;
            it.updatedAt = Date.now();
            this.saveSearchHistory(raw);
            if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
        }
    },

    clearSearchHistory() {
        const raw = this._readRawSearch();
        const now = Date.now();
        raw.forEach(item => { item.deleted = 1; item.updatedAt = now; });
        this.saveSearchHistory(raw);
        if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
    },

    updateBadgeCounts() {
        if (el.historyReadingBadge) el.historyReadingBadge.textContent = this.getReadingHistory().length;
        if (el.historySearchBadge) el.historySearchBadge.textContent = this.getSearchHistory().length;
    },

    // Normalize one entry for the sync payload
    _syncEntry(item, kind) {
        const updatedAt = Number(item.updatedAt) || Number(item.timestamp) || Date.now();
        return Object.assign({}, item, { kind: kind, updatedAt: updatedAt });
    },

    // History entries (incl. tombstones) changed since ts — the push payload
    changedSince(ts) {
        const t = ts || 0;
        const out = [];
        for (const i of this._readRawReading()) {
            if ((Number(i.updatedAt) || Number(i.timestamp) || 0) > t) out.push(this._syncEntry(i, "reading"));
        }
        for (const i of this._readRawSearch()) {
            if ((Number(i.updatedAt) || Number(i.timestamp) || 0) > t) out.push(this._syncEntry(i, "search"));
        }
        return out;
    },

    // Merge remote history entries, last-write-wins per id. Returns true if local data changed.
    mergeRemote(remoteList) {
        if (!Array.isArray(remoteList) || remoteList.length === 0) return false;
        const byIdR = new Map(this._readRawReading().map(i => [i.id, i]));
        const byIdS = new Map(this._readRawSearch().map(i => [i.id, i]));
        let changedR = false, changedS = false;
        for (const r of remoteList) {
            if (!r || typeof r.id !== "string" || !r.id) continue;
            // Ignore unknown kinds (e.g. "bookmark" rows are routed to
            // BookmarkManager by SyncManager; never misfile them as reading).
            const kind = r.kind === "search" ? "search" : (r.kind === "reading" || !r.kind ? "reading" : null);
            if (!kind) continue;
            const byId = kind === "search" ? byIdS : byIdR;
            const rUpd = Number(r.updatedAt) || 0;
            const local = byId.get(r.id);
            if (!local) {
                byId.set(r.id, Object.assign({}, r, { updatedAt: rUpd }));
                if (kind === "search") changedS = true; else changedR = true;
            } else if (rUpd > (Number(local.updatedAt) || Number(local.timestamp) || 0)) {
                byId.set(r.id, Object.assign({}, local, r, { updatedAt: rUpd }));
                if (kind === "search") changedS = true; else changedR = true;
            }
        }
        // Semantic dedup: the same page read (or same query searched) on two
        // devices yields two ids; keep only the newest live entry per semantic
        // key and tombstone the losers so the dedup propagates to all devices.
        const dedupNow = Date.now();
        const dedup = (byId, keyFn) => {
            const seen = new Map();
            let tombstoned = false;
            for (const item of byId.values()) {
                if (item.deleted) continue;
                const k = keyFn(item);
                const prev = seen.get(k);
                if (!prev) { seen.set(k, item); continue; }
                const prevT = Number(prev.timestamp) || 0;
                const curT = Number(item.timestamp) || 0;
                const loser = curT >= prevT ? prev : item;
                const winner = loser === prev ? item : prev;
                loser.deleted = 1;
                loser.updatedAt = dedupNow;
                seen.set(k, winner);
                tombstoned = true;
            }
            return tombstoned;
        };
        if (dedup(byIdR, i => (i.mode || "") + "|" + (i.bookId || "") + "|" + (i.page || 0))) changedR = true;
        if (dedup(byIdS, i => String(i.query || "").toLowerCase())) changedS = true;
        if (changedR) {
            const merged = [...byIdR.values()];
            merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
            this.saveReadingHistory(merged);
        }
        if (changedS) {
            const merged = [...byIdS.values()];
            merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
            this.saveSearchHistory(merged);
        }
        if ((changedR || changedS) && typeof SyncManager !== "undefined") {
            // Push tombstones created by the dedup so other devices converge
            SyncManager.schedulePush();
        }
        return changedR || changedS;
    },

    // One-time backfill: old entries predate updatedAt; treat timestamp as updatedAt
    backfillUpdatedAt() {
        let touched = false;
        for (const [key, raw] of [[this.READING_KEY, this._readRawReading()], [this.SEARCH_KEY, this._readRawSearch()]]) {
            let localTouched = false;
            for (const i of raw) {
                if (!i.updatedAt && i.timestamp) { i.updatedAt = i.timestamp; localTouched = true; }
            }
            if (localTouched) {
                try { localStorage.setItem(key, JSON.stringify(raw)); } catch (e) {}
                touched = true;
            }
        }
        if (touched) this.updateBadgeCounts();
    }
};

function openHistoryModal() {
    if (!el.historyModal) return;
    el.historyModal.classList.add("open");
    renderHistoryModalContent();
    if (el.historyFilterInput) {
        setTimeout(() => el.historyFilterInput.focus(), 150);
    }
}

function closeHistoryModal() {
    if (!el.historyModal) return;
    el.historyModal.classList.remove("open");
}

function computeDhammaInsights() {
    const reading = HistoryManager.getReadingHistory();
    const search = HistoryManager.getSearchHistory();

    const totalReadCount = reading.length;
    const now = Date.now();
    const oneWeekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    let thisWeekCount = 0;
    let todayCount = 0;
    const bookFrequency = {};
    const basketFrequency = {
        vinaya: 0,
        sutta: 0,
        abhidhamma: 0,
        commentary: 0
    };

    reading.forEach(item => {
        const ts = item.timestamp || 0;
        if (ts >= oneWeekAgo) {
            thisWeekCount++;
        }
        if (ts >= todayMs) {
            todayCount++;
        }

        const bName = item.bookName || item.bookId || "အမည်မသိကျမ်း";
        bookFrequency[bName] = (bookFrequency[bName] || 0) + 1;

        // Pitaka Basket categorization
        const bId = (item.bookId || "").toLowerCase();
        if (bId.includes("vinaya") || bId.startsWith("vi_") || bId.startsWith("vin")) {
            basketFrequency.vinaya++;
        } else if (bId.includes("abhidhamma") || bId.startsWith("ab_") || bId.startsWith("abh")) {
            basketFrequency.abhidhamma++;
        } else if (bId.includes("att") || bId.includes("tika") || bId.includes("atk") || bId.includes("_a") || bId.includes("_t")) {
            basketFrequency.commentary++;
        } else {
            basketFrequency.sutta++;
        }
    });

    // Determine Top Basket
    let topBasketName = "သုတ္တန်ပိဋကတ်";
    let maxBasketCount = basketFrequency.sutta;
    if (basketFrequency.vinaya > maxBasketCount) {
        topBasketName = "ဝိနည်းပိဋကတ်";
        maxBasketCount = basketFrequency.vinaya;
    }
    if (basketFrequency.abhidhamma > maxBasketCount) {
        topBasketName = "အဘိဓမ္မာပိဋကတ်";
        maxBasketCount = basketFrequency.abhidhamma;
    }
    if (basketFrequency.commentary > maxBasketCount) {
        topBasketName = "အဋ္ဌကထာ/ဋီကာ";
        maxBasketCount = basketFrequency.commentary;
    }

    if (totalReadCount === 0) {
        topBasketName = "မရှိသေးပါ";
        maxBasketCount = 0;
    }

    // Top 5 Books
    const sortedBooks = Object.keys(bookFrequency).map(name => ({
        name,
        count: bookFrequency[name]
    })).sort((a, b) => b.count - a.count).slice(0, 5);

    // Latest active entry
    let lastActiveText = "မရှိသေးပါ";
    if (reading.length > 0 && reading[0].timestamp) {
        lastActiveText = formatHistoryTime(reading[0].timestamp);
    }

    return {
        totalReadCount,
        thisWeekCount,
        todayCount,
        topBasketName,
        maxBasketCount,
        sortedBooks,
        lastActiveText,
        totalSearches: search.length
    };
}

async function exportProfileBackup() {
    try {
        const currentBookmarks = (typeof BookmarkManager !== "undefined") ? BookmarkManager.getAll() : (state.bookmarks || []);

        const backupData = {
            version: "1.0",
            appName: "Tipitaka Pali & Myanmar Web App",
            exportDate: new Date().toISOString(),
            readingHistory: HistoryManager.getReadingHistory(),
            searchHistory: HistoryManager.getSearchHistory(),
            bookmarks: currentBookmarks,
            annotations: AnnotationManager.getAll(),
            settings: {
                theme: state.theme || localStorage.getItem("tipitaka_theme") || "paper",
                fontSize: state.fontSize || localStorage.getItem("tipitaka_font_size") || "100",
                showNotes: state.showNotes !== undefined ? state.showNotes : (localStorage.getItem("tipitaka_show_notes") || "0"),
                scrollMode: state.scrollMode || localStorage.getItem("tipitaka_scroll_mode") || "feed",
                readerMode: state.readerMode || "pali"
            }
        };

        const jsonStr = JSON.stringify(backupData, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const d = new Date();
        const dateStr = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
        const filename = `tipitaka-backup-${dateStr}.json`;

        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error("Backup export failed:", err);
        alert("Backup ဖိုင် ထုတ်ယူရာတွင် အမှားတစ်ခု ဖြစ်ပေါ်ခဲ့ပါသည်: " + err.message);
    }
}

async function importProfileBackup(file) {
    if (!file) return;
    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const data = JSON.parse(text);

                if (!data || typeof data !== "object") {
                    throw new Error("မှန်ကန်သော JSON ဖိုင် မဟုတ်ပါ။");
                }

                // 1. Reading History merge
                if (Array.isArray(data.readingHistory)) {
                    const existing = HistoryManager.getReadingHistory();
                    const merged = [...data.readingHistory];
                    existing.forEach(ex => {
                        const exists = merged.some(m => m.mode === ex.mode && m.bookId === ex.bookId && m.page === ex.page);
                        if (!exists) merged.push(ex);
                    });
                    merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    HistoryManager.saveReadingHistory(merged);
                }

                // 2. Search History merge
                if (Array.isArray(data.searchHistory)) {
                    const existingS = HistoryManager.getSearchHistory();
                    const mergedS = [...data.searchHistory];
                    existingS.forEach(ex => {
                        const exists = mergedS.some(m => (m.query || "").toLowerCase() === (ex.query || "").toLowerCase());
                        if (!exists) mergedS.push(ex);
                    });
                    mergedS.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    HistoryManager.saveSearchHistory(mergedS);
                }

                // 3. Bookmarks restore (merge into BookmarkManager; accepts both
                //    the new {bookId, page} shape and legacy {book_id, page_number})
                if (Array.isArray(data.bookmarks) && data.bookmarks.length > 0 && typeof BookmarkManager !== "undefined") {
                    for (const bm of data.bookmarks) {
                        if (!bm) continue;
                        const bookId = bm.bookId || bm.book_id;
                        const page = bm.page || bm.page_number;
                        if (bookId && page) {
                            BookmarkManager.add({
                                bookId: bookId,
                                bookName: bm.bookName || bm.book_name || bookId,
                                page: Number(page) || 0,
                                note: bm.note || "",
                                mode: bm.mode || "pali"
                            });
                        }
                    }
                    if (typeof SyncManager !== "undefined") SyncManager.schedulePush();
                    loadBookmarks();
                }

                // 4. Annotations restore (merge)
                if (Array.isArray(data.annotations) && data.annotations.length > 0) {
                    const existingAnns = AnnotationManager.getAll();
                    const merged = [...data.annotations];
                    existingAnns.forEach(ex => {
                        const dup = merged.some(m => m.id === ex.id || (m.bookId === ex.bookId && m.page === ex.page && m.paraId === ex.paraId));
                        if (!dup) merged.push(ex);
                    });
                    merged.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    AnnotationManager.save(merged);
                }

                // 5. Settings restore
                if (data.settings && typeof data.settings === "object") {
                    if (data.settings.theme) setupTheme(data.settings.theme);
                    if (data.settings.fontSize) setupFontSize(data.settings.fontSize);
                    if (data.settings.showNotes !== undefined) setNotesVisibility(data.settings.showNotes);
                    if (data.settings.scrollMode) setScrollMode(data.settings.scrollMode);
                }

                HistoryManager.updateBadgeCounts();
                renderHistoryModalContent();
                alert(`✅ Backup ဖိုင်အား အောင်မြင်စွာ ပြန်လည်တင်သွင်းပြီးပါပြီ!\n\n- ဖတ်ရှုမှု မှတ်တမ်း: ${toMyanmarNum(HistoryManager.getReadingHistory().length)} ခု\n- ရှာဖွေမှု မှတ်တမ်း: ${toMyanmarNum(HistoryManager.getSearchHistory().length)} ခု\n- စာညှပ်မှတ်စုများ: ${toMyanmarNum(state.bookmarks ? state.bookmarks.length : 0)} ခု`);

            } catch (parseErr) {
                console.error("Failed to parse backup JSON:", parseErr);
                alert("Backup ဖိုင်ကို ဖတ်ရှု၍ မရပါ- " + parseErr.message);
            }
        };
        reader.readAsText(file);
    } catch (err) {
        console.error("Failed to read file:", err);
        alert("ဖိုင် ဖတ်ရှုရာတွင် ချို့ယွင်းချက် ဖြစ်ပေါ်ခဲ့ပါသည်: " + err.message);
    }
}

function renderInsightsContent() {
    const insights = computeDhammaInsights();

    let topBooksHtml = "";
    if (insights.sortedBooks.length === 0) {
        topBooksHtml = `<div class="history-empty-state" style="padding: 20px 0;"><p>ဖတ်ရှုထားသော ကျမ်းစာ မရှိသေးပါ။</p></div>`;
    } else {
        const maxCount = insights.sortedBooks[0].count || 1;
        insights.sortedBooks.forEach((b, idx) => {
            const pct = Math.max(12, Math.round((b.count / maxCount) * 100));
            topBooksHtml += `
                <div class="top-book-row">
                    <div class="top-book-header">
                        <div class="top-book-name">
                            <span>${toMyanmarNum(idx + 1)}။</span>
                            <span>${escapeHtml(b.name)}</span>
                        </div>
                        <div class="top-book-count">${toMyanmarNum(b.count)} ကြိမ်</div>
                    </div>
                    <div class="top-book-bar-track">
                        <div class="top-book-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        });
    }

    el.historyItemsContainer.innerHTML = `
        <div class="insights-container">
            <div class="insights-banner">
                <div class="insights-banner-icon">☸️</div>
                <div class="insights-banner-text">
                    <h3>ဓမ္မစာပေ ဖတ်ရှုလေ့လာမှု စာရင်းအင်း (Reading Insights)</h3>
                    <p>ဤကိန်းဂဏန်းများသည် သင်၏ Browser အတွင်း ကျမ်းစာများ ဖတ်ရှုလေ့လာခဲ့မှုများအပေါ် အခြေခံ၍ သာသနာတော်ဆိုင်ရာ ဓမ္မလေ့လာမှု တိုးတက်မှုကို အလိုအလျောက် တွက်ချက်ဖော်ပြထားခြင်း ဖြစ်ပါသည်။</p>
                </div>
            </div>

            <div class="insights-grid">
                <div class="insight-stat-card card-accent">
                    <div class="stat-icon">📖</div>
                    <div class="stat-content">
                        <div class="stat-value">${toMyanmarNum(insights.thisWeekCount)} ကြိမ်</div>
                        <div class="stat-label">ယခုအပတ် ဖတ်ရှုမှု</div>
                        <div class="stat-sub">ယနေ့ဖတ်ရှုမှု: ${toMyanmarNum(insights.todayCount)} ကြိမ်</div>
                    </div>
                </div>

                <div class="insight-stat-card card-gold">
                    <div class="stat-icon">☸️</div>
                    <div class="stat-content">
                        <div class="stat-value" title="${escapeHtml(insights.topBasketName)}">${escapeHtml(insights.topBasketName)}</div>
                        <div class="stat-label">အများဆုံး လေ့လာသော ပိဋကတ်</div>
                        <div class="stat-sub">${toMyanmarNum(insights.maxBasketCount)} ကြိမ် လေ့လာခဲ့</div>
                    </div>
                </div>

                <div class="insight-stat-card card-green">
                    <div class="stat-icon">📚</div>
                    <div class="stat-content">
                        <div class="stat-value">${toMyanmarNum(insights.totalReadCount)} မျက်နှာ</div>
                        <div class="stat-label">စုစုပေါင်း ဖွင့်ဖတ်ခဲ့မှု</div>
                        <div class="stat-sub">စကားလုံးရှာဖွေမှု: ${toMyanmarNum(insights.totalSearches)} ကြိမ်</div>
                    </div>
                </div>

                <div class="insight-stat-card card-blue">
                    <div class="stat-icon">⏱️</div>
                    <div class="stat-content">
                        <div class="stat-value">${insights.lastActiveText}</div>
                        <div class="stat-label">နောက်ဆုံး လေ့လာခဲ့ချိန်</div>
                        <div class="stat-sub">လတ်တလော ဓမ္မလေ့လာမှု</div>
                    </div>
                </div>
            </div>

            <div class="insights-section">
                <div class="insights-section-title">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="8" r="7"></circle>
                        <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
                    </svg>
                    <span>အများဆုံး ဖတ်ရှုလေ့လာဖြစ်သော ကျမ်းစာအုပ်များ (Top 5 Books)</span>
                </div>
                <div class="insights-top-books">
                    ${topBooksHtml}
                </div>
            </div>

            <div class="insights-backup-card">
                <div class="backup-card-info">
                    <h4>💾 အချက်အလက်များ သိမ်းဆည်းရန်နှင့် ပြန်လည်တင်သွင်းရန် (Backup & Restore)</h4>
                    <p>ဖတ်ရှုမှတ်တမ်း၊ ရှာဖွေမှုမှတ်တမ်း၊ မှတ်စု (Bookmarks) များနှင့် စာလုံးအရွယ်အစား/Theme ဆက်တင်များအားလုံးကို JSON ဖိုင်ဖြင့် လွယ်ကူစွာ သိမ်းဆည်း သို့မဟုတ် ဖုန်း/ကွန်ပျူတာ အချင်းချင်း လွှဲပြောင်းနိုင်ပါသည်။</p>
                </div>
                <div class="backup-card-actions">
                    <button class="history-action-btn" id="btnInsightsExport" style="padding: 8px 14px; font-weight:600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="7 10 12 15 17 10"></polyline>
                            <line x1="12" y1="15" x2="12" y2="3"></line>
                        </svg>
                        <span>Backup ထုတ်ယူမည်</span>
                    </button>
                    <button class="history-action-btn" id="btnInsightsImport" style="padding: 8px 14px; font-weight:600;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                            <polyline points="17 8 12 3 7 8"></polyline>
                            <line x1="12" y1="3" x2="12" y2="15"></line>
                        </svg>
                        <span>Restore တင်သွင်းမည်</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    const btnExp = document.getElementById("btnInsightsExport");
    if (btnExp) {
        btnExp.addEventListener("click", exportProfileBackup);
    }
    const btnImp = document.getElementById("btnInsightsImport");
    if (btnImp && el.restoreFileInput) {
        btnImp.addEventListener("click", () => el.restoreFileInput.click());
    }
}

function renderHistoryModalContent() {
    if (!el.historyItemsContainer) return;
    HistoryManager.updateBadgeCounts();

    const activeTab = state.historyActiveTab || "reading";
    const isReadingTab = activeTab === "reading";
    const isSearchTab = activeTab === "search";
    const isInsightsTab = activeTab === "insights";

    if (el.tabHistoryReading) el.tabHistoryReading.classList.toggle("active", isReadingTab);
    if (el.tabHistorySearch) el.tabHistorySearch.classList.toggle("active", isSearchTab);
    if (el.tabHistoryInsights) el.tabHistoryInsights.classList.toggle("active", isInsightsTab);

    if (el.historySearchWrapper) {
        el.historySearchWrapper.style.display = isInsightsTab ? "none" : "flex";
    }
    if (el.historyFilterPills) {
        el.historyFilterPills.style.display = isReadingTab ? "flex" : "none";
    }

    if (isInsightsTab) {
        renderInsightsContent();
        return;
    }

    const filterText = (el.historyFilterInput ? el.historyFilterInput.value : "").trim().toLowerCase();

    if (isReadingTab) {
        let items = HistoryManager.getReadingHistory();

        // Mode filter
        if (state.historyModeFilter && state.historyModeFilter !== "all") {
            items = items.filter(it => it.mode === state.historyModeFilter);
        }

        // Search text filter
        if (filterText) {
            items = items.filter(it => {
                const bName = (it.bookName || "").toLowerCase();
                const cName = (it.chapterName || "").toLowerCase();
                const pNum = toMyanmarNum(it.page) + " " + it.page;
                const sName = (it.splitMMBookName || "").toLowerCase();
                return bName.includes(filterText) || cName.includes(filterText) || pNum.includes(filterText) || sName.includes(filterText);
            });
        }

        if (items.length === 0) {
            el.historyItemsContainer.innerHTML = `
                <div class="history-empty-state">
                    <div class="history-empty-icon">📖</div>
                    <p>ဖတ်ရှုခဲ့သည့် မှတ်တမ်း မရှိသေးပါ။</p>
                    <p class="empty-sub">ကျမ်းစာအုပ်များကို ဖွင့်လှစ်ဖတ်ရှုပါက ဤနေရာတွင် အလိုအလျောက် ရက်စွဲအလိုက် စနစ်တကျ မှတ်တမ်းတင်ပေးမည် ဖြစ်ပါသည်။</p>
                </div>
            `;
            return;
        }

        const dateGroups = groupHistoryByDate(items);
        let html = "";

        dateGroups.forEach(group => {
            html += `
                <div class="history-date-header">
                    <span>${group.label}</span>
                    <span class="history-date-count">${toMyanmarNum(group.items.length)} ခု</span>
                </div>
            `;

            group.items.forEach(it => {
                let badgeClass = "badge-pali";
                let badgeText = "☸️ ပါဠိတော်";
                if (it.mode === "mm") {
                    badgeClass = "badge-mm";
                    badgeText = "🇲🇲 မြန်မာပြန်";
                } else if (it.mode === "nissaya") {
                    badgeClass = "badge-nissaya";
                    badgeText = "📜 နိဿယ";
                } else if (it.mode === "split") {
                    badgeClass = "badge-split";
                    badgeText = "📖 ယှဉ်တွဲဖတ်";
                }

                let title = it.bookName;
                if (it.mode === "split" && it.splitMMBookName) {
                    title = `${it.bookName} ↔ ${it.splitMMBookName}`;
                }

                let meta = `<span>စာမျက်နှာ ${toMyanmarNum(it.page)}</span>`;
                if (it.mode === "split" && it.splitMMPage) {
                    meta = `<span>ပါဠိ စာမျက်နှာ ${toMyanmarNum(it.page)} • မြန်မာပြန် စာမျက်နှာ ${toMyanmarNum(it.splitMMPage)}</span>`;
                }
                if (it.chapterName) {
                    meta += `<span class="meta-dot">•</span><span title="${escapeHtml(it.chapterName)}">${escapeHtml(it.chapterName)}</span>`;
                }

                const timeStr = formatHistoryTime(it.timestamp);

                html += `
                    <div class="history-item-card" data-history-id="${it.id}" data-mode="${it.mode}" data-book-id="${it.bookId}" data-page="${it.page}" data-split-book="${it.splitMMBookId || ''}" data-split-page="${it.splitMMPage || ''}">
                        <div class="history-card-left">
                            <span class="history-mode-badge ${badgeClass}">${badgeText}</span>
                            <div class="history-card-info">
                                <div class="history-item-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
                                <div class="history-item-meta">${meta}</div>
                            </div>
                        </div>
                        <div class="history-card-right">
                            <span class="history-time-tag">${timeStr}</span>
                            <button class="btn-delete-history" title="ဤမှတ်တမ်းကို ဖျက်ရန်" data-delete-id="${it.id}">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });
        });

        el.historyItemsContainer.innerHTML = html;

        // Click to open book & resume reading
        el.historyItemsContainer.querySelectorAll(".history-item-card").forEach(card => {
            card.addEventListener("click", async (e) => {
                if (e.target.closest(".btn-delete-history")) return;
                clearPendingSearch();
                const mode = card.getAttribute("data-mode");
                const bId = card.getAttribute("data-book-id");
                const page = parseInt(card.getAttribute("data-page"), 10) || 1;
                const splitBook = card.getAttribute("data-split-book");
                const splitPage = parseInt(card.getAttribute("data-split-page"), 10) || 1;

                closeHistoryModal();

                if (mode === "mm") {
                    setReaderMode("mm");
                    await loadMMBook(bId, page);
                } else if (mode === "nissaya") {
                    setReaderMode("nissaya");
                    await loadPaliBook(bId, page);
                } else if (mode === "split") {
                    setReaderMode("split");
                    await loadPaliBook(bId, page);
                    if (splitBook) {
                        await loadMMPage(splitBook, splitPage);
                    }
                } else {
                    setReaderMode("pali");
                    await loadPaliBook(bId, page);
                }
                setAppView("reader");
            });
        });

        // Delete single reading item
        el.historyItemsContainer.querySelectorAll(".btn-delete-history").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-delete-id");
                HistoryManager.deleteReadingItem(id);
                renderHistoryModalContent();
            });
        });

    } else {
        // Search History Tab
        let items = HistoryManager.getSearchHistory();

        if (filterText) {
            items = items.filter(it => it.query.toLowerCase().includes(filterText));
        }

        if (items.length === 0) {
            el.historyItemsContainer.innerHTML = `
                <div class="history-empty-state">
                    <div class="history-empty-icon">🔍</div>
                    <p>ရှာဖွေခဲ့သည့် မှတ်တမ်း မရှိသေးပါ။</p>
                    <p class="empty-sub">ပါဠိစကားလုံး၊ သုတ္တန်၊ ကျမ်းစာအုပ်များကို ရှာဖွေပါက ဤနေရာတွင် စနစ်တကျ မှတ်တမ်းတင်ပေးမည် ဖြစ်ပါသည်။</p>
                </div>
            `;
            return;
        }

        const dateGroups = groupHistoryByDate(items);
        let html = "";

        dateGroups.forEach(group => {
            html += `
                <div class="history-date-header">
                    <span>${group.label}</span>
                    <span class="history-date-count">${toMyanmarNum(group.items.length)} ခု</span>
                </div>
            `;

            group.items.forEach(it => {
                let typeLabel = "ပါဠိစကားလုံး ရှာဖွေမှု";
                if (it.type === "sutta") typeLabel = "သုတ္တန် ရှာဖွေမှု";
                else if (it.type === "book") typeLabel = "ပါဠိကျမ်းစာအုပ် ရှာဖွေမှု";
                else if (it.type === "mm_book") typeLabel = "မြန်မာပြန်ကျမ်းစာ ရှာဖွေမှု";
                else if (it.type === "mm_toc") typeLabel = "မာတိကာ ရှာဖွေမှု";
                else if (it.type === "dict") typeLabel = "အဘိဓာန် ရှာဖွေမှု";

                let meta = `<span>${typeLabel}</span>`;
                if (it.resultCount !== null && it.resultCount !== undefined) {
                    meta += `<span class="meta-dot">•</span><span>တွေ့ရှိမှု ${toMyanmarNum(it.resultCount)} ခု</span>`;
                }

                const timeStr = formatHistoryTime(it.timestamp);

                html += `
                    <div class="history-item-card" data-search-query="${escapeHtml(it.query)}" data-search-type="${it.type || 'word'}">
                        <div class="history-card-left">
                            <span class="history-mode-badge badge-search">🔍 ရှာဖွေမှု</span>
                            <div class="history-card-info">
                                <div class="history-item-title">"${escapeHtml(it.query)}"</div>
                                <div class="history-item-meta">${meta}</div>
                            </div>
                        </div>
                        <div class="history-card-right">
                            <span class="history-time-tag">${timeStr}</span>
                            <button class="btn-delete-history" title="ဤမှတ်တမ်းကို ဖျက်ရန်" data-delete-search-id="${it.id}">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                            </button>
                        </div>
                    </div>
                `;
            });
        });

        el.historyItemsContainer.innerHTML = html;

        // Click on search item to rerun search
        el.historyItemsContainer.querySelectorAll(".history-item-card").forEach(card => {
            card.addEventListener("click", (e) => {
                if (e.target.closest(".btn-delete-history")) return;
                const query = card.getAttribute("data-search-query");
                const type = card.getAttribute("data-search-type");
                closeHistoryModal();

                if (type === "dict") {
                    toggleDictSidebar(true);
                    lookupDictionary(query);
                } else {
                    openSearchModal();
                    if (el.globalSearchInput) el.globalSearchInput.value = query;
                    state.searchMode = type || "word";
                    const scope = state.searchMode.startsWith("mm_") ? "mm" : "pali";
                    setSearchScope(scope, state.searchMode);
                    performSearch();
                }
            });
        });

        // Delete single search item
        el.historyItemsContainer.querySelectorAll(".btn-delete-history").forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.getAttribute("data-delete-search-id");
                HistoryManager.deleteSearchItem(id);
                renderHistoryModalContent();
            });
        });
    }
}

function toggleSidebar(forceState = null) {
    state.isSidebarOpen = (forceState !== null) ? forceState : !state.isSidebarOpen;
    el.appSidebar.classList.toggle("collapsed", !state.isSidebarOpen);
    if (state.isSidebarOpen) {
        if (window.innerWidth <= 992) {
            toggleDictSidebar(false);
        }
        if (state.appView === "reader" && (!state.activeTab || state.activeTab === "tab-books")) {
            switchToSidebarTab("tab-toc");
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        }
    }
    if (el.btnNavMore) el.btnNavMore.classList.toggle("active", state.isSidebarOpen);
    if (window.innerWidth > 992) {
        localStorage.setItem("tipitaka_sidebar_open", state.isSidebarOpen ? "1" : "0");
    }
    updateSidebarBackdrop();
}

function updateSidebarBackdrop() {
    const isMobile = window.innerWidth <= 992;
    const backdrop = document.getElementById("sidebarBackdrop");
    if (!backdrop) return;
    if (isMobile && (state.isSidebarOpen || state.isDictOpen)) {
        backdrop.classList.add("active");
    } else {
        backdrop.classList.remove("active");
    }
    if (el.btnNavMore) el.btnNavMore.classList.toggle("active", state.isSidebarOpen);
    if (el.btnNavDict) el.btnNavDict.classList.toggle("active", state.isDictOpen);
}

function closeSidebarMobile() {
    if (window.innerWidth <= 992) {
        if (state.isSidebarOpen) {
            toggleSidebar(false);
        }
        if (state.isDictOpen) {
            toggleDictSidebar(false);
        }
    }
}

// ----------------- UI / Event Listeners -----------------

function setupEventListeners() {
    // Mode Switcher Buttons
    el.btnModePali.addEventListener("click", () => setReaderMode("pali"));
    el.btnModeMM.addEventListener("click", () => setReaderMode("mm"));
    if (el.btnModeNissaya) el.btnModeNissaya.addEventListener("click", () => setReaderMode("nissaya"));
    el.btnModeSplit.addEventListener("click", () => setReaderMode("split"));
    el.btnCrossLink.addEventListener("click", handleCrossLink);
    if (el.btnCrossLinkNissaya) el.btnCrossLinkNissaya.addEventListener("click", handleCrossLinkNissaya);
    if (el.btnViewOriginalImage) el.btnViewOriginalImage.addEventListener("click", handleViewOriginalImage);

    // Toggle Footnotes / Variant Readings
    if (el.btnToggleNotes) {
        el.btnToggleNotes.addEventListener("click", () => {
            setNotesVisibility(!state.showNotes);
        });
    }
    if (el.btnToggleNotesMobile) {
        el.btnToggleNotesMobile.addEventListener("click", () => {
            setNotesVisibility(!state.showNotes);
        });
    }

    // Toggle Myanmar Nissaya Glosses (Desktop Toolbar)
    if (el.btnToggleNissaya) {
        el.btnToggleNissaya.addEventListener("click", () => {
            setNissayaVisibility(!state.showNissaya);
        });
    }

    // Toggle Sidebar
    el.btnToggleSidebar.addEventListener("click", () => toggleSidebar());
    
    // Toggle Dictionary
    el.btnToggleDict.addEventListener("click", () => toggleDictSidebar());
    el.btnCloseDict.addEventListener("click", () => toggleDictSidebar(false));

    // Backdrop Click -> Close Drawers on Mobile
    const sidebarBackdrop = document.getElementById("sidebarBackdrop");
    if (sidebarBackdrop) {
        sidebarBackdrop.addEventListener("click", () => {
            closeSidebarMobile();
        });
    }

    // Mobile Close Button inside Drawer
    const btnCloseSidebarMobile = document.getElementById("btnCloseSidebarMobile");
    if (btnCloseSidebarMobile) {
        btnCloseSidebarMobile.addEventListener("click", () => toggleSidebar(false));
    }

    // Mobile drawer quick-controls: collapsible (state persisted).
    // Default to collapsed on phones so the ကျမ်းစာများ/မာတိကာ tabs and their
    // lists get the full drawer space immediately; an explicit saved choice wins.
    const DRAWER_CONTROLS_KEY = "tipitaka_mobile_drawer_controls_collapsed";
    const setDrawerControlsCollapsed = (collapsed) => {
        const wrap = document.getElementById("mobileDrawerControls");
        if (wrap) wrap.classList.toggle("controls-collapsed", !!collapsed);
        try { localStorage.setItem(DRAWER_CONTROLS_KEY, collapsed ? "1" : "0"); } catch (e) {}
    };
    let _drawerControlsCollapsed = false;
    try {
        const _savedDrawerControls = localStorage.getItem(DRAWER_CONTROLS_KEY);
        _drawerControlsCollapsed = _savedDrawerControls === "1" ||
            (_savedDrawerControls === null && window.innerWidth <= 768);
    } catch (e) {
        _drawerControlsCollapsed = window.innerWidth <= 768;
    }
    setDrawerControlsCollapsed(_drawerControlsCollapsed);
    const btnToggleDrawerControls = document.getElementById("btnToggleDrawerControls");
    if (btnToggleDrawerControls) {
        btnToggleDrawerControls.addEventListener("click", () => {
            const wrap = document.getElementById("mobileDrawerControls");
            setDrawerControlsCollapsed(!(wrap && wrap.classList.contains("controls-collapsed")));
        });
    }

    // Swipe-to-close for mobile drawers (standard touch pattern):
    // swipe left on the left drawer, swipe right on the right dict panel.
    const _swipeState = { x: null, target: null };
    const _drawerSwipeStart = (which) => (e) => {
        if (window.innerWidth > 992 || e.touches.length !== 1) { _swipeState.x = null; return; }
        _swipeState.x = e.touches[0].clientX;
        _swipeState.target = which;
    };
    const _drawerSwipeEnd = (isOpen, closeFn, dir) => (e) => {
        if (_swipeState.x === null) return;
        const dx = e.changedTouches[0].clientX - _swipeState.x;
        _swipeState.x = null;
        if (window.innerWidth <= 992 && isOpen() && ((dir < 0 && dx < -60) || (dir > 0 && dx > 60))) {
            closeFn();
        }
    };
    if (el.appSidebar) {
        el.appSidebar.addEventListener("touchstart", _drawerSwipeStart("sidebar"), { passive: true });
        el.appSidebar.addEventListener("touchend",
            _drawerSwipeEnd(() => state.isSidebarOpen, () => toggleSidebar(false), -1), { passive: true });
    }
    if (el.dictSidebar) {
        el.dictSidebar.addEventListener("touchstart", _drawerSwipeStart("dict"), { passive: true });
        el.dictSidebar.addEventListener("touchend",
            _drawerSwipeEnd(() => state.isDictOpen, () => toggleDictSidebar(false), 1), { passive: true });
    }

    // Mobile Mode Buttons inside Drawer
    document.querySelectorAll(".mobile-mode-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-mode");
            setReaderMode(mode);
            setAppView("reader");
            if (window.innerWidth <= 768) {
                closeSidebarMobile();
            }
        });
    });

    // Mobile User Guide button inside Drawer
    const btnOpenHelpMobile = document.getElementById("btnOpenHelpMobile");
    if (btnOpenHelpMobile) {
        btnOpenHelpMobile.addEventListener("click", () => {
            closeSidebarMobile();
            openHelpModal("tab-guide-android");
        });
    }

    // Mobile Font Adjustments in Drawer
    const btnFontDecMobile = document.getElementById("btnFontDecMobile");
    const btnFontIncMobile = document.getElementById("btnFontIncMobile");
    if (btnFontDecMobile) btnFontDecMobile.addEventListener("click", () => setupFontSize(state.fontSize - 10));
    if (btnFontIncMobile) btnFontIncMobile.addEventListener("click", () => setupFontSize(state.fontSize + 10));
    
    // Page Navigation
    function prevPage(scrollToBottom = false) {
        clearPendingSearch();
        _trackAction("prevPage");
        if (state.scrollMode === "feed") {
            const cur = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            const first = (state.readerMode === "mm") ? state.mmFirstPage : state.paliFirstPage;
            const target = cur - 1;
            if (target >= first) {
                const prevEl = document.getElementById(state.readerMode === "mm" ? `mm-page-${target}` : `pali-page-${target}`);
                if (prevEl) {
                    prevEl.scrollIntoView({ behavior: "auto", block: "start" });
                } else {
                    handleLoadPrevPage().then(() => {
                        const elTarget = document.getElementById(state.readerMode === "mm" ? `mm-page-${target}` : `pali-page-${target}`);
                        if (elTarget) elTarget.scrollIntoView({ behavior: "auto", block: "start" });
                    });
                }
            }
        } else {
            if (state.readerMode === "mm") {
                if (state.mmPage > state.mmFirstPage) {
                    showScrollToast(`စာမျက်နှာ ${toMyanmarNum(state.mmPage - 1)} သို့ ပြောင်းနေပါသည်...`);
                    loadMMPage(state.mmBookId, state.mmPage - 1).then(() => {
                        if (scrollToBottom && el.readerContainer) el.readerContainer.scrollTop = el.readerContainer.scrollHeight;
                    });
                }
            } else {
                if (state.paliPage > state.paliFirstPage) {
                    showScrollToast(`စာမျက်နှာ ${toMyanmarNum(state.paliPage - 1)} သို့ ပြောင်းနေပါသည်...`);
                    loadPaliPage(state.paliBookId, state.paliPage - 1).then(() => {
                        if (scrollToBottom && el.readerContainer) el.readerContainer.scrollTop = el.readerContainer.scrollHeight;
                    });
                }
            }
        }
    }

    function nextPage(scrollToBottom = false) {
        clearPendingSearch();
        _trackAction("nextPage");
        if (state.scrollMode === "feed") {
            const cur = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            const last = (state.readerMode === "mm") ? state.mmLastPage : state.paliLastPage;
            const target = cur + 1;
            if (target <= last) {
                const nextEl = document.getElementById(state.readerMode === "mm" ? `mm-page-${target}` : `pali-page-${target}`);
                if (nextEl) {
                    nextEl.scrollIntoView({ behavior: "auto", block: "start" });
                } else {
                    loadNextFeedPage().then(() => {
                        const elTarget = document.getElementById(state.readerMode === "mm" ? `mm-page-${target}` : `pali-page-${target}`);
                        if (elTarget) elTarget.scrollIntoView({ behavior: "auto", block: "start" });
                    });
                }
            }
        } else {
            if (state.readerMode === "mm") {
                if (state.mmPage < state.mmLastPage) {
                    showScrollToast(`စာမျက်နှာ ${toMyanmarNum(state.mmPage + 1)} သို့ ပြောင်းနေပါသည်...`);
                    loadMMPage(state.mmBookId, state.mmPage + 1).then(() => {
                        if (scrollToBottom && el.readerContainer) el.readerContainer.scrollTop = el.readerContainer.scrollHeight;
                    });
                }
            } else {
                if (state.paliPage < state.paliLastPage) {
                    showScrollToast(`စာမျက်နှာ ${toMyanmarNum(state.paliPage + 1)} သို့ ပြောင်းနေပါသည်...`);
                    loadPaliPage(state.paliBookId, state.paliPage + 1).then(() => {
                        if (scrollToBottom && el.readerContainer) el.readerContainer.scrollTop = el.readerContainer.scrollHeight;
                    });
                }
            }
        }
    }

    el.btnPrevPage.addEventListener("click", () => prevPage(false));
    el.btnNextPage.addEventListener("click", () => nextPage(false));
    el.btnFooterPrev.addEventListener("click", () => prevPage(false));
    el.btnFooterNext.addEventListener("click", () => nextPage(false));

    if (el.btnLoadPrevPage) {
        el.btnLoadPrevPage.addEventListener("click", handleLoadPrevPage);
    }

    if (el.pageScrollIndicator) {
        el.pageScrollIndicator.addEventListener("click", () => nextPage(false));
    }

    // Split View Independent Navigation & Sync Controls
    if (el.btnSplitPaliPrev) {
        el.btnSplitPaliPrev.addEventListener("click", () => {
            if (state.paliPage > (state.paliFirstPage || 1)) {
                loadPaliPage(state.paliBookId, state.paliPage - 1);
            }
        });
    }
    if (el.btnSplitPaliNext) {
        el.btnSplitPaliNext.addEventListener("click", () => {
            if (state.paliPage < (state.paliLastPage || 99999)) {
                loadPaliPage(state.paliBookId, state.paliPage + 1);
            }
        });
    }
    if (el.splitPaliPageInput) {
        const handleSplitPaliInput = () => {
            const p = parseInt(el.splitPaliPageInput.value, 10);
            if (!isNaN(p) && p !== state.paliPage) {
                loadPaliPage(state.paliBookId, p);
            }
        };
        el.splitPaliPageInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleSplitPaliInput();
        });
        el.splitPaliPageInput.addEventListener("change", handleSplitPaliInput);
    }

    const btnRightPrev = el.btnSplitRightPrev || el.btnSplitMMPrev;
    if (btnRightPrev) {
        btnRightPrev.addEventListener("click", () => {
            if (state.splitRightType === "mm") {
                if (state.mmPage > (state.mmFirstPage || 1)) {
                    loadMMPage(state.mmBookId, state.mmPage - 1, true);
                }
            } else {
                if (state.splitRightPage > 1) {
                    loadSplitRightPage(state.splitRightBookId, state.splitRightPage - 1, state.splitRightType);
                }
            }
        });
    }

    const btnRightNext = el.btnSplitRightNext || el.btnSplitMMNext;
    if (btnRightNext) {
        btnRightNext.addEventListener("click", () => {
            if (state.splitRightType === "mm") {
                if (state.mmPage < (state.mmLastPage || 99999)) {
                    loadMMPage(state.mmBookId, state.mmPage + 1, true);
                }
            } else {
                if (state.splitRightPage < (state.splitRightLastPage || 99999)) {
                    loadSplitRightPage(state.splitRightBookId, state.splitRightPage + 1, state.splitRightType);
                }
            }
        });
    }

    const inputRight = el.splitRightPageInput || el.splitMMPageInput;
    if (inputRight) {
        const handleSplitRightInput = () => {
            const p = parseInt(inputRight.value, 10);
            if (!isNaN(p)) {
                if (state.splitRightType === "mm") {
                    if (p !== state.mmPage) loadMMPage(state.mmBookId, p, true);
                } else {
                    if (p !== state.splitRightPage) loadSplitRightPage(state.splitRightBookId, p, state.splitRightType);
                }
            }
        };
        inputRight.addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleSplitRightInput();
        });
        inputRight.addEventListener("change", handleSplitRightInput);
    }

    if (el.btnSplitSync) {
        el.btnSplitSync.addEventListener("click", handleSplitSync);
    }

    if (el.btnOpenCompanionMobile) {
        el.btnOpenCompanionMobile.addEventListener("click", () => {
            toggleSidebar(false);
            // Previously this toggled the desktop ".header-right" dropdown, which
            // is hidden on mobile (body.view-reader hides .app-header), so the tap
            // went nowhere. Route it to the unified switcher modal instead.
            openEditionSwitcher();
        });
    }

    // Scroll Mode Dropdown in Header
    if (el.btnScrollMode && el.scrollModeDropdownWrapper) {
        el.btnScrollMode.addEventListener("click", (e) => {
            e.stopPropagation();
            el.scrollModeDropdownWrapper.classList.toggle("open");
        });
        document.addEventListener("click", (e) => {
            if (!el.scrollModeDropdownWrapper.contains(e.target)) {
                el.scrollModeDropdownWrapper.classList.remove("open");
            }
        });
    }

    // Scroll Mode Selection (Dropdown & Mobile Drawer)
    document.querySelectorAll(".scroll-opt-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-scroll-mode");
            setScrollMode(mode);
            if (el.scrollModeDropdownWrapper) el.scrollModeDropdownWrapper.classList.remove("open");
        });
    });

    document.querySelectorAll(".mobile-scroll-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const mode = btn.getAttribute("data-scroll-mode");
            setScrollMode(mode);
        });
    });

    // Mouse Wheel Continuous Page Scroll (Only active in Single mode; Feed mode uses native scroll)
    let wheelDeltaAccumulator = 0;
    let wheelCooldown = false;
    let wheelResetTimer = null;

    el.readerContainer.addEventListener("wheel", (e) => {
        if (state.readerMode === "split") return;
        if (state.scrollMode !== "single") return; // Feed mode uses pure native 120Hz/60Hz smooth scroll

        const container = el.readerContainer;
        const isAtBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) <= 8;
        const isAtTop = container.scrollTop <= 5;

        if (e.deltaY > 0 && isAtBottom) {
            if (wheelCooldown) return;
            wheelDeltaAccumulator += e.deltaY;
            clearTimeout(wheelResetTimer);
            wheelResetTimer = setTimeout(() => { wheelDeltaAccumulator = 0; }, 400);

            if (wheelDeltaAccumulator >= 120) {
                wheelCooldown = true;
                wheelDeltaAccumulator = 0;
                nextPage(false);
                setTimeout(() => { wheelCooldown = false; }, 600);
            }
        } else if (e.deltaY < 0 && isAtTop) {
            if (wheelCooldown) return;
            wheelDeltaAccumulator += Math.abs(e.deltaY);
            clearTimeout(wheelResetTimer);
            wheelResetTimer = setTimeout(() => { wheelDeltaAccumulator = 0; }, 400);

            if (wheelDeltaAccumulator >= 120) {
                wheelCooldown = true;
                wheelDeltaAccumulator = 0;
                prevPage(true);
                setTimeout(() => { wheelCooldown = false; }, 600);
            }
        } else {
            wheelDeltaAccumulator = 0;
        }
    }, { passive: true });

    // Touch Gestures: Horizontal Swipe & Vertical Boundary Pull
    let touchStartX = 0;
    let touchStartY = 0;
    let touchEndX = 0;
    let touchEndY = 0;
    let touchStartAtTop = false;
    let touchStartAtBottom = false;

    el.readerContainer.addEventListener("touchstart", (e) => {
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
            touchEndX = touchStartX;
            touchEndY = touchStartY;

            const c = el.readerContainer;
            touchStartAtTop = c.scrollTop <= 8;
            touchStartAtBottom = (c.scrollHeight - c.scrollTop - c.clientHeight) <= 15;
        }
    }, { passive: true });

    el.readerContainer.addEventListener("touchmove", (e) => {
        if (e.touches.length === 1) {
            touchEndX = e.touches[0].clientX;
            touchEndY = e.touches[0].clientY;
        }
    }, { passive: true });

    el.readerContainer.addEventListener("touchend", (e) => {
        // A drag that selects text is for annotation, not page-turning:
        // skip swipe navigation while a text selection is active.
        try {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed && sel.toString().trim().length > 1) return;
        } catch (err) {}
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        const absX = Math.abs(diffX);
        const absY = Math.abs(diffY);

        // Tap to Toggle Bars in Focus Mode
        if (state.isFocusMode && absX < 15 && absY < 15) {
            const activeElem = document.elementFromPoint(touchEndX, touchEndY);
            if (activeElem && !activeElem.closest("button, a, input, select, .paranum, .note-btn, .edition-btn, #btnExitFocusMode, .word, .bookmark-toggle-btn")) {
                const selection = window.getSelection ? window.getSelection().toString() : "";
                if (!selection || selection.trim().length === 0) {
                    toggleFocusBars();
                    return;
                }
            }
        }

        if (state.scrollMode === "single") {
            // Horizontal Swipe (Left/Right)
            if (absX > 65 && absY < 50) {
                if (diffX < 0) nextPage(false);
                else prevPage(false);
                return;
            }

            // Vertical Boundary Pull (Up/Down)
            if (touchStartAtBottom && diffY < -70 && absX < 60) {
                nextPage(false);
                return;
            }
            if (touchStartAtTop && diffY > 70 && absX < 60) {
                prevPage(true);
                return;
            }
        }
    });

    // Infinite Feed Scroll listener (Desktop mouse wheel & Mobile finger scroll)
    let feedScrollThrottleTimer = null;
    el.readerContainer.addEventListener("scroll", () => {
        // Auto-hide revealed bars in focus mode when scrolling
        if (state.isFocusMode && document.body.classList.contains("focus-bars-revealed")) {
            document.body.classList.remove("focus-bars-revealed");
        }

        if (state.scrollMode !== "feed") return;

        // Auto load next page when scrolled near bottom (within 250px)
        // Auto load previous page when scrolled near top (within 250px)
        if (!feedScrollThrottleTimer) {
            feedScrollThrottleTimer = setTimeout(() => {
                feedScrollThrottleTimer = null;
                const c = el.readerContainer;
                if (!c) return;
                if (c.scrollHeight - c.scrollTop - c.clientHeight <= 250) {
                    loadNextFeedPage();
                } else if (c.scrollTop <= 250) {
                    handleLoadPrevPage();
                }
            }, 120);
        }

        // NOTE: visible-page tracking is done by the IntersectionObserver in
        // setupPageVisibilityObserver() (it observes every appended feed
        // section). The old scroll-based checkVisiblePageOnScroll() was removed
        // 2026-09-28: it ran querySelectorAll + getBoundingClientRect() on
        // every loaded page on each scroll tick — O(N) forced layouts.
    }, { passive: true });
    
    // Page Number Input Jump
    el.pageNumberInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            // Accept both Myanmar and Arabic digits typed by the user
            const p = fromMyanmarNum(el.pageNumberInput.value);
            if (p > 0) {
                clearPendingSearch();
                if (state.readerMode === "mm") loadMMPage(state.mmBookId, p);
                else loadPaliPage(state.paliBookId, p);
            }
        }
    });

    // Bookmark Toggle
    el.btnBookmarkToggle.addEventListener("click", toggleCurrentBookmark);

    // Unified Edition Switcher hub ("ကျမ်းရွေး") — desktop header entry.
    // Opens the very same modal as the mobile bottom toolbar, so Pāḷi /
    // Aṭṭhakathā / Ṭīkā / မြန်မာပြန် / နိဿယ stay reachable from one place.
    if (el.btnOpenEdition) {
        el.btnOpenEdition.addEventListener("click", (e) => {
            e.stopPropagation();
            openEditionSwitcher();
        });
    }

    // Commentary Dropdown
    el.btnRelated.addEventListener("click", (e) => {
        e.stopPropagation();
        el.relatedDropdownWrapper.classList.toggle("open");
    });
    document.addEventListener("click", (e) => {
        if (!el.relatedDropdownWrapper.contains(e.target)) {
            el.relatedDropdownWrapper.classList.remove("open");
        }
    });

    // Sidebar Tabs Switcher
    el.sidebarTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const tabId = btn.getAttribute("data-tab");
            el.sidebarTabBtns.forEach(b => b.classList.remove("active"));
            el.sidebarPanels.forEach(p => p.classList.remove("active"));
            btn.classList.add("active");
            document.getElementById(tabId).classList.add("active");
            state.activeTab = tabId;

            if (tabId === "tab-toc") {
                const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
                highlightActiveToc(curPg, true);
            } else if (tabId === "tab-suttas") {
                const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
                highlightActiveSutta(curPg);
                const activeSuttaBtn = el.suttaList ? el.suttaList.querySelector(".sutta-item-btn.active") : null;
                if (activeSuttaBtn) activeSuttaBtn.scrollIntoView({ block: "nearest", behavior: "smooth" });
            } else if (tabId === "tab-annotations") {
                renderAnnotationSidebar();
            }
        });
    });

    // Click header current book/chapter badge to open TOC
    if (el.currentBookBadge) {
        el.currentBookBadge.addEventListener("click", () => {
            toggleSidebar(true);
            const tocTabBtn = document.querySelector('.sidebar-tabs .tab-btn[data-tab="tab-toc"]');
            if (tocTabBtn) tocTabBtn.click();
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        });
    }

    // Click Mobile & Tablet Chapter Breadcrumb to open TOC directly
    if (el.mobileChapterBreadcrumb) {
        el.mobileChapterBreadcrumb.addEventListener("click", () => {
            toggleSidebar(true);
            const tocTabBtn = document.querySelector('.sidebar-tabs .tab-btn[data-tab="tab-toc"]');
            if (tocTabBtn) tocTabBtn.click();
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        });
    }

    // Click Sticky Current Reading Card in TOC to smoothly focus on active item
    if (el.tocCurrentCard) {
        el.tocCurrentCard.addEventListener("click", () => {
            setAppView("reader");
            if (!el.tocList) return;
            const activeBtn = el.tocList.querySelector(".toc-item-btn.active");
            if (activeBtn) {
                activeBtn.scrollIntoView({ block: "center", behavior: "smooth" });
                activeBtn.classList.add("toc-flash-highlight");
                setTimeout(() => activeBtn.classList.remove("toc-flash-highlight"), 1200);
            }
        });
    }

    // Basket Filtering in Books tab (Pali)
    el.basketBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            el.basketBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.activeBasket = btn.getAttribute("data-basket");
            renderBooksTree();
        });
    });
    el.booksFilterInput.addEventListener("input", () => renderBooksTree());
    el.tocFilterInput.addEventListener("input", () => handleTocFilter());
    if (el.btnTocExpandAll) {
        el.btnTocExpandAll.addEventListener("click", () => expandAllToc());
    }
    if (el.btnTocCollapseAll) {
        el.btnTocCollapseAll.addEventListener("click", () => collapseAllToc());
    }
    el.suttaFilterInput.addEventListener("input", () => renderSuttas());

    // Font Size Adjustments
    el.btnFontDec.addEventListener("click", () => setupFontSize(state.fontSize - 10));
    el.btnFontInc.addEventListener("click", () => setupFontSize(state.fontSize + 10));

    // Themes
    el.themeBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const theme = btn.getAttribute("data-theme");
            setupTheme(theme);
        });
    });

    // Dictionary Manual Search
    el.btnDictSearch.addEventListener("click", () => {
        lookupDictionary(el.dictSearchInput.value.trim());
    });
    el.dictSearchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") lookupDictionary(el.dictSearchInput.value.trim());
    });

    // Search Modal & Delegated Results Click
    el.btnOpenSearch.addEventListener("click", openSearchModal);
    el.btnCloseModal.addEventListener("click", closeSearchModal);
    el.searchModal.addEventListener("click", (e) => {
        if (e.target === el.searchModal) closeSearchModal();
    });
    if (el.searchResultsList) {
        el.searchResultsList.addEventListener("click", async (e) => {
            const item = e.target.closest(".search-result-item");
            if (!item) return;
            const targetType = item.getAttribute("data-type");
            const bid = item.getAttribute("data-bid");
            const p = parseInt(item.getAttribute("data-page"), 10);
            const paraNum = item.getAttribute("data-para");
            const q = el.globalSearchInput ? el.globalSearchInput.value.trim() : "";
            state.pendingSearchHighlight = q || null;
            closeSearchModal();

            if (targetType === "nissaya") {
                // Ensure Nissaya gloss layer is enabled
                if (!state.showNissaya) {
                    setNissayaVisibility(true);
                }
                setReaderMode("pali");
                await loadPaliBook(bid, p);
                setAppView("reader");

                // Scroll to target paragraph and highlight its gloss if present
                if (paraNum) {
                    setTimeout(() => {
                        const targetAnchor = document.querySelector(`a[name="para${paraNum}"]`);
                        if (targetAnchor) {
                            targetAnchor.scrollIntoView({ behavior: "smooth", block: "center" });
                            const targetP = targetAnchor.closest("p");
                            if (targetP) {
                                targetP.classList.add("search-target-highlight");
                                setTimeout(() => targetP.classList.remove("search-target-highlight"), 2500);
                            }
                        }
                    }, 350);
                }
            } else if (targetType === "mm") {
                setReaderMode("mm");
                await loadMMBook(bid, p);
                setAppView("reader");
            } else {
                setReaderMode("pali");
                await loadPaliBook(bid, p);
                setAppView("reader");
            }

            if (window.innerWidth > 992) {
                switchToSidebarTab("tab-toc");
                highlightActiveToc(p, true);
            }
        });
    }

    // Help / User Guide Modal & Navigation Tabs
    function openHelpModal(preferredTab) {
        if (!el.helpModal) return;
        el.helpModal.classList.add("open");
        const defaultTab = preferredTab || (window.innerWidth <= 768 ? "tab-guide-android" : "tab-guide-web");
        const targetBtn = document.querySelector(`.guide-nav-tab[data-guide-tab="${defaultTab}"]`);
        if (targetBtn) {
            targetBtn.click();
        }
    }

    if (el.btnOpenHelp) el.btnOpenHelp.addEventListener("click", () => openHelpModal());
    if (el.btnCloseHelp) el.btnCloseHelp.addEventListener("click", () => el.helpModal.classList.remove("open"));
    el.helpModal.addEventListener("click", (e) => {
        if (e.target === el.helpModal) el.helpModal.classList.remove("open");
    });

    // Wire Guide Navigation Tabs (Web vs Android vs Common)
    const guideNavTabs = document.querySelectorAll(".guide-nav-tab");
    const guideTabPanels = document.querySelectorAll(".guide-tab-panel");
    guideNavTabs.forEach(tabBtn => {
        tabBtn.addEventListener("click", () => {
            const targetId = tabBtn.getAttribute("data-guide-tab");
            guideNavTabs.forEach(b => b.classList.toggle("active", b === tabBtn));
            guideTabPanels.forEach(p => p.classList.toggle("active", p.id === targetId));
        });
    });

    const btnMoreHelp = document.getElementById("btnMoreHelp");
    if (btnMoreHelp) {
        btnMoreHelp.addEventListener("click", () => openHelpModal());
    }
    const btnMoreReaderHelp = document.getElementById("btnMoreReaderHelp");
    if (btnMoreReaderHelp) {
        btnMoreReaderHelp.addEventListener("click", () => {
            if (typeof closeReaderMoreSheet === "function") closeReaderMoreSheet();
            openHelpModal("tab-guide-android");
        });
    }

    // In-App Updater check button (Android native bridge with Web fallback)
    const btnCheckAppUpdate = document.getElementById("btnCheckAppUpdate");
    if (btnCheckAppUpdate) {
        btnCheckAppUpdate.addEventListener("click", () => {
            if (window.AndroidBridge && typeof window.AndroidBridge.checkForUpdates === "function") {
                window.AndroidBridge.checkForUpdates();
            } else {
                showAppToast("Web ဗားရှင်းသည် အမြဲတမ်း နောက်ဆုံးဗားရှင်း ဖြစ်ပါသည်");
            }
        });
    }
    el.globalSearchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(performSearch, 300);
        el.btnClearSearch.style.display = el.globalSearchInput.value ? "block" : "none";
    });
    el.btnClearSearch.addEventListener("click", () => {
        el.globalSearchInput.value = "";
        el.btnClearSearch.style.display = "none";
        performSearch();
    });
    if (el.scopeBtnPali) {
        el.scopeBtnPali.addEventListener("click", () => {
            setSearchScope("pali");
            if (el.globalSearchInput && el.globalSearchInput.value.trim()) {
                performSearch();
            }
        });
    }
    if (el.scopeBtnMM) {
        el.scopeBtnMM.addEventListener("click", () => {
            setSearchScope("mm");
            if (el.globalSearchInput && el.globalSearchInput.value.trim()) {
                performSearch();
            }
        });
    }
    if (el.bookScopeAllBtn) {
        el.bookScopeAllBtn.addEventListener("click", () => setBookScope("all"));
    }
    if (el.bookScopeCurrentBtn) {
        el.bookScopeCurrentBtn.addEventListener("click", () => setBookScope("current"));
    }
    el.modalTabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            el.modalTabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.searchMode = btn.getAttribute("data-mode");
            refreshBookScopeUI();
            performSearch();
        });
    });

    // Word Click in Reader Content -> Trigger Dictionary (for both Single and Split View)
    function handleWordClick(e) {
        // Don't hijack taps on annotation highlights (they open the edit popup)
        const t = e && e.target;
        if (t && t.closest && t.closest("span.ann-sel")) return;
        // v7.43: badge taps open the inline jump row — never the dictionary.
        // (This handler sits on #paliContent, deeper than the badge toggle on
        // #readerContainer, so it runs first in the bubble phase.)
        if (t && t.closest && t.closest(".divider-badge")) return;
        const sel = window.getSelection();
        // A non-collapsed selection means the user is selecting text for
        // annotation — the 🖍️/📝 toolbar owns that gesture. Don't also fire a
        // dictionary lookup for the selected text (desktop drag-select and
        // mobile handle-select both land here).
        if (sel && !sel.isCollapsed && sel.toString().trim()) return;
        let clickedWord = "";

        {
            const wordEl = e.target.closest(".pali-word");
            if (wordEl) {
                clickedWord = wordEl.textContent.trim();
            } else if (sel && sel.isCollapsed) {
                try {
                    sel.modify("extend", "backward", "character");
                    let charBefore = sel.toString();
                    sel.modify("move", "forward", "character");
                    sel.modify("extend", "forward", "character");
                    let charAfter = sel.toString();
                    
                    if (!/\s/.test(charBefore) && !/\s/.test(charAfter)) {
                        let p1 = sel.toString();
                        while (!/\s/.test(p1) && p1.length < 50) {
                            sel.modify("extend", "backward", "character");
                            p1 = sel.toString();
                        }
                        p1 = p1.trim();
                        sel.modify("move", "forward", "character");
                        
                        sel.modify("extend", "forward", "character");
                        let p2 = sel.toString();
                        while (!/\s/.test(p2) && p2.length < 50) {
                            sel.modify("extend", "forward", "character");
                            p2 = sel.toString();
                        }
                        p2 = p2.trim();
                        clickedWord = p1 + p2;
                    }
                    sel.removeAllRanges();
                } catch (ex) {}
            }
        }

        if (clickedWord) {
            clickedWord = clickedWord.replace(/[\s\d၀-၉၊။,.\-—–“’”\"'()\[\]<>:;?!/\\#*~`]+/g, "").trim();
            if (clickedWord.length > 0) {
                lookupDictionary(clickedWord);
            }
        }
    }

    el.paliContent.addEventListener("click", handleWordClick);
    el.splitPaliContent.addEventListener("click", handleWordClick);
    if (el.splitRightContent) el.splitRightContent.addEventListener("click", handleWordClick);
    if (el.splitMMContent && el.splitMMContent !== el.splitRightContent) el.splitMMContent.addEventListener("click", handleWordClick);

    // Quick Popover Close
    el.btnClosePopover.addEventListener("click", () => {
        el.dictQuickPopover.style.display = "none";
    });
    el.btnOpenInFullDict.addEventListener("click", () => {
        el.dictQuickPopover.style.display = "none";
        toggleDictSidebar(true);
        lookupDictionary(el.popoverWord.textContent);
    });

    // Global Keyboard Shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
            if (e.key === "Escape") {
                closeSearchModal();
                closeHistoryModal();
                el.helpModal.classList.remove("open");
                el.dictQuickPopover.style.display = "none";
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                // Allow Ctrl+K (search) even while typing in an input, e.g. page-number box
                e.preventDefault();
                openSearchModal();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
                // Allow Ctrl+H (history) even while typing in an input
                e.preventDefault();
                openHistoryModal();
            }
            return;
        }

        if (e.key === "F11") {
            e.preventDefault();
            toggleFocusMode();
        } else if (e.key === "[" || e.key === "ArrowLeft") {
            prevPage();
        } else if (e.key === "]" || e.key === "ArrowRight") {
            nextPage();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
            e.preventDefault();
            openSearchModal();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "h") {
            e.preventDefault();
            openHistoryModal();
        } else if (e.key === "/" && !el.searchModal.classList.contains("open")) {
            e.preventDefault();
            openSearchModal();
        } else if (e.key === "?" && !el.helpModal.classList.contains("open")) {
            e.preventDefault();
            openHelpModal();
        } else if (e.key === "Escape") {
            if (state.isFocusMode) {
                toggleFocusMode(false);
            }
            closeSearchModal();
            closeHistoryModal();
            el.helpModal.classList.remove("open");
            el.dictQuickPopover.style.display = "none";
        }
    });

    // Home Navigation & Bottom Bar (APK Style)
    if (el.btnGoHome) {
        el.btnGoHome.addEventListener("click", () => setAppView("home"));
    }

    if (el.homeBasketTabs) {
        el.homeBasketTabs.querySelectorAll(".home-basket-tab").forEach(tab => {
            tab.addEventListener("click", () => {
                state.homeBasket = tab.getAttribute("data-basket");
                renderHomeCatalog();
            });
        });
    }

    if (el.homeBtnModeToggle) {
        el.homeBtnModeToggle.addEventListener("click", () => {
            const nextMode = (state.readerMode === "mm") ? "pali" : "mm";
            setReaderMode(nextMode);
            renderHomeCatalog();
        });
    }

    if (el.homeBtnSearch) {
        el.homeBtnSearch.addEventListener("click", openSearchModal);
    }

    if (el.btnFloatingSutta) {
        el.btnFloatingSutta.addEventListener("click", () => {
            openSearchModal();
            const suttaTabBtn = document.querySelector('.modal-tab-btn[data-mode="sutta"]');
            if (suttaTabBtn) suttaTabBtn.click();
        });
    }

    if (el.btnNavHome) {
        el.btnNavHome.addEventListener("click", () => {
            closeSidebarMobile();
            setAppView("home");
        });
    }
    if (el.btnNavReader) {
        el.btnNavReader.addEventListener("click", async () => {
            closeSidebarMobile();
            if (!state.paliBookId && !state.mmBookId) {
                await loadRecentOrFirst();
            } else {
                if (state.readerMode === "mm") {
                    if (!el.paliContent || !el.paliContent.innerHTML.trim() || el.paliContent.innerHTML.includes("ဖွင့်လှစ်နေပါသည်")) {
                        await loadMMBook(state.mmBookId || "01_vinaya_01", state.mmPage || 1);
                    }
                } else if (state.readerMode === "split") {
                    await renderSplitView();
                } else {
                    if (!el.paliContent || !el.paliContent.innerHTML.trim() || el.paliContent.innerHTML.includes("ဖွင့်လှစ်နေပါသည်")) {
                        await loadPaliBook(state.paliBookId || "mula_vi_01", state.paliPage || 1);
                    }
                }
            }
            setAppView("reader");
        });
    }
    if (el.btnNavRecent) {
        el.btnNavRecent.addEventListener("click", () => {
            closeSidebarMobile();
            openHistoryModal();
        });
    }
    if (el.btnNavSearch) {
        el.btnNavSearch.addEventListener("click", () => {
            openSearchModal();
            const wordTabBtn = document.querySelector('.modal-tab-btn[data-mode="word"]');
            if (wordTabBtn) wordTabBtn.click();
        });
    }
    if (el.btnNavDict) {
        el.btnNavDict.addEventListener("click", () => {
            toggleDictSidebar();
            if (state.isDictOpen && el.dictSearchInput) {
                setTimeout(() => el.dictSearchInput.focus(), 250);
            }
        });
    }
    if (el.btnNavMore) {
        el.btnNavMore.addEventListener("click", () => {
            if (state.appView === "reader") {
                openReaderMoreSheet();
            } else {
                toggleSidebar();
            }
        });
    }

    // Comprehensive History Modal Listeners
    if (el.btnOpenHistory) {
        el.btnOpenHistory.addEventListener("click", openHistoryModal);
    }
    if (el.btnOpenHistoryMobile) {
        el.btnOpenHistoryMobile.addEventListener("click", () => {
            closeSidebarMobile();
            openHistoryModal();
        });
    }
    if (el.btnCloseHistory) {
        el.btnCloseHistory.addEventListener("click", closeHistoryModal);
    }
    if (el.historyModal) {
        el.historyModal.addEventListener("click", (e) => {
            if (e.target === el.historyModal) closeHistoryModal();
        });
    }
    if (el.btnClearAllHistory) {
        el.btnClearAllHistory.addEventListener("click", () => {
            const tab = state.historyActiveTab;
            let msg = "ဖတ်ရှုခဲ့သည့် မှတ်တမ်းအားလုံးကို ဖျက်ပစ်ရန် သေချာပါသလား?";
            if (tab === "search") {
                msg = "ရှာဖွေခဲ့သည့် မှတ်တမ်းအားလုံးကို ဖျက်ပစ်ရန် သေချာပါသလား?";
            } else if (tab === "insights") {
                msg = "ဖတ်ရှုမှုနှင့် ရှာဖွေမှု မှတ်တမ်းအားလုံးကို ရှင်းလင်းဖျက်ပစ်ရန် သေချာပါသလား?";
            }
            if (confirm(msg)) {
                if (tab === "reading") {
                    HistoryManager.clearReadingHistory();
                } else if (tab === "search") {
                    HistoryManager.clearSearchHistory();
                } else {
                    HistoryManager.clearReadingHistory();
                    HistoryManager.clearSearchHistory();
                }
                renderHistoryModalContent();
            }
        });
    }
    if (el.btnBackupHistory) {
        el.btnBackupHistory.addEventListener("click", exportProfileBackup);
    }
    if (el.btnRestoreHistory) {
        el.btnRestoreHistory.addEventListener("click", () => {
            if (el.restoreFileInput) el.restoreFileInput.click();
        });
    }
    if (el.restoreFileInput) {
        el.restoreFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files[0]) {
                importProfileBackup(e.target.files[0]);
                e.target.value = "";
            }
        });
    }
    if (el.historyFilterInput) {
        let hDebounce = null;
        el.historyFilterInput.addEventListener("input", () => {
            if (el.btnClearHistoryFilter) {
                el.btnClearHistoryFilter.style.display = el.historyFilterInput.value ? "block" : "none";
            }
            clearTimeout(hDebounce);
            hDebounce = setTimeout(renderHistoryModalContent, 150);
        });
    }
    if (el.btnClearHistoryFilter) {
        el.btnClearHistoryFilter.addEventListener("click", () => {
            el.historyFilterInput.value = "";
            el.btnClearHistoryFilter.style.display = "none";
            renderHistoryModalContent();
        });
    }
    if (el.tabHistoryReading) {
        el.tabHistoryReading.addEventListener("click", () => {
            state.historyActiveTab = "reading";
            renderHistoryModalContent();
        });
    }
    if (el.tabHistorySearch) {
        el.tabHistorySearch.addEventListener("click", () => {
            state.historyActiveTab = "search";
            renderHistoryModalContent();
        });
    }
    if (el.tabHistoryInsights) {
        el.tabHistoryInsights.addEventListener("click", () => {
            state.historyActiveTab = "insights";
            renderHistoryModalContent();
        });
    }
    if (el.historyFilterPills) {
        el.historyFilterPills.querySelectorAll(".history-pill").forEach(pill => {
            pill.addEventListener("click", () => {
                el.historyFilterPills.querySelectorAll(".history-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                state.historyModeFilter = pill.getAttribute("data-mode-filter") || "all";
                renderHistoryModalContent();
            });
        });
    }

    // Focus / Fullscreen Mode Listeners
    if (el.btnToggleFullscreen) {
        el.btnToggleFullscreen.addEventListener("click", () => toggleFocusMode());
    }
    if (el.btnToggleFullscreenMobile) {
        el.btnToggleFullscreenMobile.addEventListener("click", () => {
            closeSidebarMobile();
            toggleFocusMode();
        });
    }
    if (el.btnExitFocusMode) {
        el.btnExitFocusMode.addEventListener("click", () => toggleFocusMode(false));
    }

    // Tap-to-toggle bars on reader click for Desktop
    if (el.readerContainer) {
        el.readerContainer.addEventListener("click", (e) => {
            if (!state.isFocusMode) return;
            const target = e.target;
            if (target && target.closest("button, a, input, select, .paranum, .note-btn, .edition-btn, #btnExitFocusMode, .word, .bookmark-toggle-btn")) {
                return;
            }
            const selection = window.getSelection ? window.getSelection().toString() : "";
            if (selection && selection.trim().length > 0) return;
            toggleFocusBars();
        });
    }

    // Sync state when native fullscreen changes (e.g. Esc key or browser gesture)
    document.addEventListener("fullscreenchange", () => {
        const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFull && state.isFocusMode) {
            toggleFocusMode(false);
        }
    });
    document.addEventListener("webkitfullscreenchange", () => {
        const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFull && state.isFocusMode) {
            toggleFocusMode(false);
        }
    });

    // Responsive Window Resize Handler for Sidebar and Drawer State
    let resizeDebounceTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeDebounceTimer);
        resizeDebounceTimer = setTimeout(() => {
            const isDesktop = window.innerWidth > 992;
            updateSidebarBackdrop();
            if (isDesktop && state.appView === "reader") {
                if (!state.isSidebarOpen) {
                    toggleSidebar(true);
                }
                switchToSidebarTab("tab-toc");
                const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
                highlightActiveToc(curPg, false);
            }
        }, 150);
    });

    // Mobile Header Breadcrumb Back Button -> Home Catalog
    if (el.btnMobileBackHome) {
        el.btnMobileBackHome.addEventListener("click", () => {
            closeSidebarMobile();
            setAppView("home");
        });
    }

    // Mobile Header Breadcrumb Page Badge -> Jump inline
    if (el.btnMobilePageBadge) {
        el.btnMobilePageBadge.addEventListener("click", (e) => {
            e.stopPropagation();
            if (el.jumpInlineRow) {
                const isHidden = el.jumpInlineRow.hidden;
                el.jumpInlineRow.hidden = !isHidden;
                if (!el.jumpInlineRow.hidden && el.jumpInlineInput) {
                    el.jumpInlineInput.value = "";
                    el.jumpInlineInput.focus();
                }
            } else if (el.btnOpenJumpSheet) {
                el.btnOpenJumpSheet.click();
            }
        });
    }

    // ------------------------------------------------------------
    // Mobile Dedicated Reader Toolbar (Option A) Event Listeners
    // ------------------------------------------------------------
    if (el.btnReaderEdition) {
        el.btnReaderEdition.addEventListener("click", (e) => {
            e.stopPropagation();
            openEditionSwitcher();
        });
    }

    if (el.btnReaderSearch) {
        el.btnReaderSearch.addEventListener("click", (e) => {
            e.stopPropagation();
            openSearchModal();
        });
    }

    if (el.btnReaderDict) {
        el.btnReaderDict.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleDictSidebar();
        });
    }

    if (el.btnReaderBookmark) {
        el.btnReaderBookmark.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleCurrentBookmark();
            const curBookId = (state.readerMode === "mm") ? state.mmBookId : state.paliBookId;
            const curPage = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            const isBookmarked = BookmarkManager.isBookmarked(curBookId, curPage);
            if (el.toolbarBookmarkIcon) {
                el.toolbarBookmarkIcon.setAttribute("fill", isBookmarked ? "currentColor" : "none");
            }
            if (el.toolbarBookmarkLabel) {
                el.toolbarBookmarkLabel.textContent = isBookmarked ? "မှတ်ပြီး" : "စာမှတ်";
            }
            showScrollToast(isBookmarked ? "🔖 စာမျက်နှာကို မှတ်သားပြီးပါပြီ" : "စာမှတ်ကို ဖယ်ရှားပြီးပါပြီ");
        });
    }

    if (el.btnReaderMore) {
        el.btnReaderMore.addEventListener("click", (e) => {
            e.stopPropagation();
            openReaderMoreSheet();
        });
    }

    if (el.btnMobileHeaderSearch) {
        el.btnMobileHeaderSearch.addEventListener("click", (e) => {
            e.stopPropagation();
            openSearchModal();
        });
    }

    if (el.btnMobileHeaderTOC) {
        el.btnMobileHeaderTOC.addEventListener("click", (e) => {
            e.stopPropagation();
            toggleSidebar(true);
            const tocTabBtn = document.querySelector('.sidebar-tabs .tab-btn[data-tab="tab-toc"]');
            if (tocTabBtn) tocTabBtn.click();
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        });
    }

    // Unified Edition Switcher Close & Backdrop Click
    if (el.btnCloseEditionSwitcher) {
        el.btnCloseEditionSwitcher.addEventListener("click", closeEditionSwitcher);
    }
    if (el.editionSwitcherBackdrop) {
        el.editionSwitcherBackdrop.addEventListener("click", (e) => {
            if (e.target === el.editionSwitcherBackdrop) closeEditionSwitcher();
        });
    }

    // Reader More Sheet Close & Backdrop Click
    if (el.btnCloseReaderMore) {
        el.btnCloseReaderMore.addEventListener("click", closeReaderMoreSheet);
    }
    if (el.readerMoreBackdrop) {
        el.readerMoreBackdrop.addEventListener("click", (e) => {
            if (e.target === el.readerMoreBackdrop) closeReaderMoreSheet();
        });
    }

    // Quick Settings in Reader More Sheet
    if (el.btnMoreFontDec) {
        el.btnMoreFontDec.addEventListener("click", () => {
            setupFontSize(state.fontSize - 10);
            if (el.moreFontDisplay) el.moreFontDisplay.textContent = `${state.fontSize}%`;
        });
    }
    if (el.btnMoreFontInc) {
        el.btnMoreFontInc.addEventListener("click", () => {
            setupFontSize(state.fontSize + 10);
            if (el.moreFontDisplay) el.moreFontDisplay.textContent = `${state.fontSize}%`;
        });
    }
    document.querySelectorAll(".qs-theme-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            const theme = btn.getAttribute("data-theme");
            if (theme) {
                setupTheme(theme);
                document.querySelectorAll(".qs-theme-btn").forEach(b => {
                    b.classList.toggle("active", b.getAttribute("data-theme") === theme);
                });
            }
        });
    });
    if (el.btnMoreToggleNotes) {
        el.btnMoreToggleNotes.addEventListener("click", () => {
            setNotesVisibility(!state.showNotes);
            if (el.moreNotesStateText) {
                el.moreNotesStateText.textContent = state.showNotes ? "အောက်ခြေမှတ်စု ဝှက်မည်" : "အောက်ခြေမှတ်စု ပြမည်";
            }
        });
    }
    if (el.btnMoreToggleNissaya) {
        el.btnMoreToggleNissaya.addEventListener("click", () => {
            // In dedicated nissaya mode the toggle returns to Pāḷi view.
            if (state.readerMode === "nissaya") {
                setReaderMode("pali");
                return;
            }
            // Nissaya glosses only render under Pāḷi text: if the user is in
            // Myanmar-translation mode, switch them to Pāḷi first.
            if (state.readerMode === "mm" && !state.showNissaya) {
                setReaderMode("pali");
            }
            setNissayaVisibility(!state.showNissaya);
        });
    }

    // Actions in Reader More Sheet
    if (el.btnMoreDictSheet) {
        el.btnMoreDictSheet.addEventListener("click", () => {
            closeReaderMoreSheet();
            toggleDictSidebar(true);
        });
    }
    if (el.btnMoreCopy) {
        el.btnMoreCopy.addEventListener("click", () => {
            closeReaderMoreSheet();
            copyCurrentPageText();
        });
    }
    if (el.btnMoreTOC) {
        el.btnMoreTOC.addEventListener("click", () => {
            closeReaderMoreSheet();
            toggleSidebar(true);
            const tocTabBtn = document.querySelector('.sidebar-tabs .tab-btn[data-tab="tab-toc"]');
            if (tocTabBtn) tocTabBtn.click();
            const curPg = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
            highlightActiveToc(curPg, true);
        });
    }
    if (el.btnMoreHome) {
        el.btnMoreHome.addEventListener("click", () => {
            closeReaderMoreSheet();
            closeSidebarMobile();
            setAppView("home");
        });
    }

    // Initialize Scroll-based Auto-Hiding Chrome
    setupScrollAutoHiding();
}

function toggleDictSidebar(forceState = null) {
    state.isDictOpen = (forceState !== null) ? forceState : !state.isDictOpen;
    el.dictSidebar.classList.toggle("collapsed", !state.isDictOpen);
    el.btnToggleDict.classList.toggle("active", state.isDictOpen);
    if (el.btnNavDict) el.btnNavDict.classList.toggle("active", state.isDictOpen);
    if (state.isDictOpen && window.innerWidth <= 992) {
        state.isSidebarOpen = false;
        el.appSidebar.classList.add("collapsed");
        if (el.btnNavMore) el.btnNavMore.classList.remove("active");
    }
    localStorage.setItem("tipitaka_dict_open", state.isDictOpen ? "1" : "0");
    updateSidebarBackdrop();
}

function setupTheme(themeName) {
    state.theme = themeName;
    document.documentElement.setAttribute("data-theme", themeName);
    document.body.classList.remove("theme-paper", "theme-light", "theme-night");
    document.body.classList.add(`theme-${themeName}`);
    document.querySelectorAll(".theme-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-theme") === themeName);
    });
    localStorage.setItem("tipitaka_theme", themeName);
}

function setNotesVisibility(show) {
    state.showNotes = show;
    document.body.classList.toggle("hide-notes", !show);
    
    if (el.btnToggleNotes) {
        el.btnToggleNotes.classList.toggle("active", show);
        if (el.toggleNotesLabel) {
            el.toggleNotesLabel.textContent = show ? "မူကွဲ: ဖွင့်" : "မူကွဲ: ပိတ်";
        }
        el.btnToggleNotes.title = show ? "မူကွဲပါဠိတော်များ ဖွင့်ထားပါသည် (ပိတ်ရန် နှိပ်ပါ)" : "မူကွဲပါဠိတော်များ ပိတ်ထားပါသည် (ဖွင့်ရန် နှိပ်ပါ)";
    }
    
    if (el.btnToggleNotesMobile) {
        el.btnToggleNotesMobile.classList.toggle("active", show);
        if (el.toggleNotesLabelMobile) {
            el.toggleNotesLabelMobile.textContent = show ? "မူကွဲပါဠိတော်များ: ဖွင့်ထားသည်" : "မူကွဲပါဠိတော်များ: ပိတ်ထားသည်";
        }
    }

    localStorage.setItem("tipitaka_show_notes", show ? "1" : "0");
}

// ---------------- Myanmar Nissaya glosses ----------------
// Per-paragraph word-by-word Myanmar glosses (source: tipitakapali.org
// my_nissaya, digitized by wikipali.org, CC BY-NC-SA 3.0 non-commercial).
const nissayaCache = new Map(); // "bookId/page" -> glosses object or null
const NISSAYA_CACHE_MAX = 50;   // bounded LRU: long scroll-speech sessions
                                // would otherwise cache every visited page

function cacheNissayaGlosses(key, glosses) {
    // Re-insert to refresh recency, then evict the oldest entry when full.
    nissayaCache.delete(key);
    nissayaCache.set(key, glosses);
    if (nissayaCache.size > NISSAYA_CACHE_MAX) {
        const oldest = nissayaCache.keys().next().value;
        nissayaCache.delete(oldest);
    }
}

function setNissayaVisibility(show) {
    state.showNissaya = show;
    localStorage.setItem("tipitaka_show_nissaya", show ? "1" : "0");
    updateNissayaToggleLabel();
    applyNissayaToCurrentPage();
}

function updateNissayaToggleLabel() {
    const isPaliMode = (state.readerMode !== "mm");

    // More Sheet toggle state text
    if (el.moreNissayaStateText) {
        if (state.readerMode === "nissaya") {
            el.moreNissayaStateText.textContent = "နိဿယ mode ဖွင့်ထားသည်";
        } else if (state.readerMode === "mm" && !state.showNissaya) {
            el.moreNissayaStateText.textContent = "ပါဠိပြောင်း၍ နိဿယပြမည်";
        } else {
            el.moreNissayaStateText.textContent = state.showNissaya ? "နိဿယ ဝှက်မည်" : "နိဿယ ပြမည်";
        }
    }
    // Always show the toggle — in MM mode tapping it switches to Pāḷi first.
    if (el.nissayaToggleRow) {
        el.nissayaToggleRow.style.display = "";
    }

    // Desktop Reader Toolbar button
    if (el.btnToggleNissaya) {
        el.btnToggleNissaya.style.display = isPaliMode ? "inline-flex" : "none";
        el.btnToggleNissaya.classList.toggle("active", !!state.showNissaya);
        el.btnToggleNissaya.title = state.showNissaya ? "မြန်မာနိဿယ အနက် ဖွင့်ထားပါသည် (ပိတ်ရန် နှိပ်ပါ)" : "မြန်မာနိဿယ အနက် ပိတ်ထားပါသည် (ဖွင့်ရန် နှိပ်ပါ)";
    }
    if (el.toggleNissayaLabel) {
        el.toggleNissayaLabel.textContent = state.showNissaya ? "နိဿယ: ဖွင့်" : "နိဿယ: ပိတ်";
    }

    // Edition Switcher sheet card & badge (if open)
    const switcherCard = document.getElementById("switcherCardNissaya");
    if (switcherCard) {
        switcherCard.classList.toggle("active-layer", !!state.showNissaya);
        const badge = switcherCard.querySelector("#switcherBadgeNissaya") || switcherCard.querySelector(".edition-card-badge");
        if (badge) {
            badge.className = `edition-card-badge ${state.showNissaya ? 'badge-active' : 'badge-muted'}`;
            badge.textContent = state.showNissaya ? '✓ ဖွင့်ထားသည်' : 'ပိတ်ထားသည်';
        }
    }
}

async function fetchNissayaGlosses(bookId, page) {
    const key = bookId + "/" + page;
    if (nissayaCache.has(key)) {
        // Refresh recency so re-reads keep the entry alive in the LRU.
        const v = nissayaCache.get(key);
        nissayaCache.delete(key);
        nissayaCache.set(key, v);
        return v;
    }
    let glosses = null;
    try {
        const r = await fetch(`/api/nissaya/${encodeURIComponent(bookId)}/${page}`);
        if (r.ok) {
            const d = await r.json();
            if (d.available && d.glosses && Object.keys(d.glosses).length) {
                glosses = d.glosses;
                cacheNissayaGlosses(key, glosses);
            }
        }
    } catch (e) { glosses = null; }
    return glosses;
}

function injectNissayaGlosses(container, glosses) {
    if (!container || !glosses) return;
    // Each paragraph carries <a name="paraN"> — N is the paragraph number.
    container.querySelectorAll('a[name^="para"]').forEach(anchor => {
        const m = /^para(\d+)/.exec(anchor.getAttribute("name") || "");
        if (!m) return;
        const gloss = glosses[m[1]];
        if (!gloss) return;
        let p = anchor.closest("p");
        if (!p) return;
        // For verses the anchor sits in a hangnum <p>; attach after the verse lines.
        let insertAfter = p;
        let sib = p.nextElementSibling;
        while (sib && sib.tagName === "P" && /^gatha/i.test(sib.className || "")) {
            insertAfter = sib;
            sib = sib.nextElementSibling;
        }
        if (insertAfter.nextElementSibling && insertAfter.nextElementSibling.classList.contains("nissaya-gloss")) return;
        const div = document.createElement("div");
        div.className = "nissaya-gloss";
        div.setAttribute("data-para", m[1]);
        div.textContent = gloss;
        insertAfter.after(div);
    });
}

function injectNissayaModeBlocks(container, glosses) {
    if (!container || !glosses) return;
    const injectedParas = new Set();
    container.querySelectorAll('a[name^="para"]').forEach(anchor => {
        const m = /^para(\d+)/.exec(anchor.getAttribute("name") || "");
        if (!m) return;
        const paraNum = m[1];
        if (injectedParas.has(paraNum)) return;
        const gloss = glosses[paraNum];
        if (!gloss) return;
        let p = anchor.closest("p");
        if (!p) return;
        // For verses the anchor sits in a hangnum <p>; attach after the verse lines.
        let insertAfter = p;
        let sib = p.nextElementSibling;
        while (sib && sib.tagName === "P" && /^gatha/i.test(sib.className || "")) {
            insertAfter = sib;
            sib = sib.nextElementSibling;
        }
        if (insertAfter.nextElementSibling && insertAfter.nextElementSibling.classList.contains("nissaya-mode-block")) {
            injectedParas.add(paraNum);
            return;
        }
        const block = document.createElement("div");
        block.className = "nissaya-mode-block";
        block.setAttribute("data-para", paraNum);

        // Render as clean, pure scripture paragraphs (same typography as Myanmar translation)
        const paragraphs = String(gloss).split(/\n\s*\n/);
        paragraphs.forEach(paraText => {
            const trimmed = paraText.trim();
            if (!trimmed) return;
            const pEl = document.createElement("p");
            pEl.className = "nissaya-mode-para bodytext";
            pEl.textContent = trimmed;
            block.appendChild(pEl);
        });

        insertAfter.after(block);
        injectedParas.add(paraNum);
    });

    // Fallback: any remaining glosses for this page that didn't have an anchor in DOM
    Object.keys(glosses).forEach(paraNum => {
        if (!injectedParas.has(paraNum)) {
            const gloss = glosses[paraNum];
            if (!gloss) return;
            const block = document.createElement("div");
            block.className = "nissaya-mode-block";
            block.setAttribute("data-para", paraNum);
            const paragraphs = String(gloss).split(/\n\s*\n/);
            paragraphs.forEach(paraText => {
                const trimmed = paraText.trim();
                if (!trimmed) return;
                const pEl = document.createElement("p");
                pEl.className = "nissaya-mode-para bodytext";
                pEl.textContent = trimmed;
                block.appendChild(pEl);
            });
            container.appendChild(block);
            injectedParas.add(paraNum);
        }
    });
}

async function applyNissayaToFeedSection(sec, bookId, page) {
    if (!sec || !bookId || !page || state.readerMode === "mm") return;
    if (state.readerMode === "nissaya") {
        const glosses = await fetchNissayaGlosses(bookId, page);
        if (!glosses || !Object.keys(glosses).length) {
            if (!sec.querySelector(".nissaya-mode-notice")) {
                const notice = document.createElement("div");
                notice.className = "nissaya-mode-notice";
                notice.innerHTML = `
                    <div style="font-size:1.05rem;margin-bottom:12px;font-weight:600;">📜 ဤစာမျက်နှာအတွက် မြန်မာနိဿယ မရှိသေးပါ။</div>
                    <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
                        <button class="tool-btn" onclick="setReaderMode('pali')">☸️ ပါဠိတော်ဖြင့် ဖတ်ရှုရန်</button>
                        <button class="tool-btn" onclick="setReaderMode('mm')">🇲🇲 မြန်မာပြန်ဖြင့် ဖတ်ရှုရန်</button>
                    </div>
                `;
                sec.prepend(notice);
            }
        } else {
            injectNissayaModeBlocks(sec, glosses);
        }
    } else if (state.showNissaya) {
        const glosses = await fetchNissayaGlosses(bookId, page);
        if (glosses && Object.keys(glosses).length) {
            injectNissayaGlosses(sec, glosses);
        }
    }
}

let nissayaGen = 0; // guards against page-flip races during async fetch
async function applyNissayaToCurrentPage() {
    const gen = ++nissayaGen;
    document.querySelectorAll(".nissaya-gloss").forEach(e => e.remove());
    document.querySelectorAll(".nissaya-mode-block").forEach(e => e.remove());
    document.querySelectorAll(".nissaya-mode-notice").forEach(e => e.remove());
    if (el.paliContent) el.paliContent.classList.toggle("nissaya-mode", state.readerMode === "nissaya");
    updateNissayaToggleLabel();
    if (state.readerMode === "mm") return;
    // Dedicated Nissaya reading mode: glosses become the primary text
    if (state.readerMode === "nissaya") {
        await applyNissayaMode(gen);
        return;
    }
    if (!state.showNissaya) return;
    const jobs = [];
    const collect = (rootEl, bookId, fallbackPage) => {
        if (!rootEl || !bookId) return;
        const sections = rootEl.querySelectorAll("section.feed-page-item[data-page]");
        if (sections.length) {
            sections.forEach(sec => jobs.push({
                container: sec, bookId,
                page: parseInt(sec.getAttribute("data-page"), 10) || fallbackPage
            }));
        } else if (fallbackPage) {
            jobs.push({ container: rootEl, bookId, page: fallbackPage });
        }
    };
    collect(el.paliContent, state.paliBookId, state.paliPage);
    collect(el.splitPaliContent, state.paliBookId, state.paliPage);
    for (const { container, bookId, page } of jobs) {
        const glosses = await fetchNissayaGlosses(bookId, page);
        if (gen !== nissayaGen) return; // superseded by a newer render/toggle
        injectNissayaGlosses(container, glosses);
    }
}

async function applyNissayaMode(gen) {
    if (!el.paliContent || !state.paliBookId) return;
    const bookId = state.paliBookId;
    const sections = el.paliContent.querySelectorAll("section.feed-page-item[data-page]");
    if (sections.length > 0) {
        for (const sec of sections) {
            const page = parseInt(sec.getAttribute("data-page"), 10) || state.paliPage;
            const glosses = await fetchNissayaGlosses(bookId, page);
            if (gen !== nissayaGen) return; // superseded
            if (!glosses || !Object.keys(glosses).length) {
                if (!sec.querySelector(".nissaya-mode-notice")) {
                    const notice = document.createElement("div");
                    notice.className = "nissaya-mode-notice";
                    notice.innerHTML = `
                        <div style="font-size:1.05rem;margin-bottom:12px;font-weight:600;">📜 ဤစာမျက်နှာအတွက် မြန်မာနိဿယ မရှိသေးပါ။</div>
                        <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
                            <button class="tool-btn" onclick="setReaderMode('pali')">☸️ ပါဠိတော်ဖြင့် ဖတ်ရှုရန်</button>
                            <button class="tool-btn" onclick="setReaderMode('mm')">🇲🇲 မြန်မာပြန်ဖြင့် ဖတ်ရှုရန်</button>
                        </div>
                    `;
                    sec.prepend(notice);
                }
            } else {
                injectNissayaModeBlocks(sec, glosses);
            }
        }
    } else {
        const page = state.paliPage;
        if (!page) return;
        const glosses = await fetchNissayaGlosses(bookId, page);
        if (gen !== nissayaGen) return;
        if (!glosses || !Object.keys(glosses).length) {
            const notice = document.createElement("div");
            notice.className = "nissaya-mode-notice";
            notice.innerHTML = `
                <div style="font-size:1.05rem;margin-bottom:12px;font-weight:600;">📜 ဤစာမျက်နှာအတွက် မြန်မာနိဿယ မရှိသေးပါ။</div>
                <div style="display:flex;gap:10px;justify-content:center;margin-top:14px;flex-wrap:wrap;">
                    <button class="tool-btn" onclick="setReaderMode('pali')">☸️ ပါဠိတော်ဖြင့် ဖတ်ရှုရန်</button>
                    <button class="tool-btn" onclick="setReaderMode('mm')">🇲🇲 မြန်မာပြန်ဖြင့် ဖတ်ရှုရန်</button>
                </div>
            `;
            el.paliContent.prepend(notice);
            return;
        }
        injectNissayaModeBlocks(el.paliContent, glosses);
    }
}

function setScrollMode(mode) {
    state.scrollMode = mode;
    localStorage.setItem("tipitaka_scroll_mode", mode);
    
    // Update header dropdown button text & icon
    const icons = {
        feed: "📜",
        single: "📖"
    };
    const labels = {
        feed: "စာမျက်နှာဆက်တိုက်",
        single: "တစ်မျက်နှာချင်း"
    };
    if (el.scrollModeIcon) el.scrollModeIcon.textContent = icons[mode] || "📜";
    if (el.scrollModeText) el.scrollModeText.textContent = labels[mode] || "စာမျက်နှာဆက်တိုက်";

    // Update active class on dropdown options & mobile drawer options
    document.querySelectorAll(".scroll-opt-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-scroll-mode") === mode);
    });
    document.querySelectorAll(".mobile-scroll-btn").forEach(btn => {
        btn.classList.toggle("active", btn.getAttribute("data-scroll-mode") === mode);
    });

    if (mode === "feed") {
        if (el.infiniteSentinel) el.infiniteSentinel.style.display = "flex";
        if (el.pageScrollIndicator) el.pageScrollIndicator.style.display = "none";
        const curPage = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        if (state.readerMode === "mm") loadMMPage(state.mmBookId, curPage);
        else if (_isPaliReaderMode()) loadPaliPage(state.paliBookId, curPage);
    } else {
        if (el.infiniteSentinel) el.infiniteSentinel.style.display = "none";
        if (el.loadPrevBox) el.loadPrevBox.style.display = "none";
        if (el.pageScrollIndicator) el.pageScrollIndicator.style.display = "flex";
        if (infiniteSentinelObserver) {
            infiniteSentinelObserver.disconnect();
            infiniteSentinelObserver = null;
        }
        const curPage = (state.readerMode === "mm") ? state.mmPage : state.paliPage;
        if (state.readerMode === "mm") loadMMPage(state.mmBookId, curPage);
        else if (_isPaliReaderMode()) loadPaliPage(state.paliBookId, curPage);
    }
}

let infiniteSentinelObserver = null;
function setupSentinelObserver() {
    try {
        if (infiniteSentinelObserver) {
            infiniteSentinelObserver.disconnect();
            infiniteSentinelObserver = null;
        }
        if (state.scrollMode !== "feed") return;

        const sentinel = document.getElementById("infiniteSentinel");
        if (!sentinel || typeof IntersectionObserver === "undefined") return;

        infiniteSentinelObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    loadNextFeedPage();
                }
            });
        }, {
            root: el.readerContainer || null,
            rootMargin: "0px 0px 200px 0px",
            threshold: 0.05
        });

        infiniteSentinelObserver.observe(sentinel);
    } catch (e) {
        console.warn("setupSentinelObserver error:", e);
    }
}

// Feed navigation lock timestamp: if a load wedges (network stall, an
// exception outside try/finally), the lock self-heals after this long so
// feed navigation never silently dies.
const FEED_LOCK_STALE_MS = 30000;
let _feedLockSince = 0;
function _feedLockStaleReset() {
    if (state.isLoadingMore && _feedLockSince && Date.now() - _feedLockSince > FEED_LOCK_STALE_MS) {
        console.warn("[feed] stale isLoadingMore lock reset");
        state.isLoadingMore = false;
        _feedLockSince = 0;
    }
}
function _feedLockAcquire() {
    state.isLoadingMore = true;
    _feedLockSince = Date.now();
}
function _feedLockRelease() {
    state.isLoadingMore = false;
    _feedLockSince = 0;
}
async function loadNextFeedPage() {
    _trackAction("loadNextFeedPage");
    _feedLockStaleReset();
    if (state.isLoadingMore) return;
    if (state.scrollMode !== "feed") return;

    const loaded = getLoadedFeedPages();
    if (loaded.length === 0) return;

    const currentLast = loaded[loaded.length - 1];
    const nextPage = currentLast + 1;

    if (_isPaliReaderMode()) {
        if (nextPage > state.paliLastPage) {
            showSentinelEnd();
            return;
        }
        if (document.getElementById(`pali-page-${nextPage}`)) return;
        _feedLockAcquire();
        showSentinelLoading(true);
        try {
            await loadPaliPage(state.paliBookId, nextPage, null, true);
        } catch (e) {
            console.error(e);
        } finally {
            _feedLockRelease();
            showSentinelLoading(false);
            pruneFeedDOM();
        }
    } else if (state.readerMode === "mm") {
        if (nextPage > state.mmLastPage) {
            showSentinelEnd();
            return;
        }
        if (document.getElementById(`mm-page-${nextPage}`)) return;
        _feedLockAcquire();
        showSentinelLoading(true);
        try {
            await loadMMPage(state.mmBookId, nextPage, false, true);
        } catch (e) {
            console.error(e);
        } finally {
            _feedLockRelease();
            showSentinelLoading(false);
            pruneFeedDOM();
        }
    }
}

async function handleLoadPrevPage() {
    _feedLockStaleReset();
    if (state.isLoadingMore) return;
    if (state.scrollMode !== "feed") return;

    const loaded = getLoadedFeedPages();
    if (loaded.length === 0) return;

    const currentFirst = loaded[0];
    const prevPageNum = currentFirst - 1;

    _feedLockAcquire();
    if (el.btnLoadPrevPage) el.btnLoadPrevPage.disabled = true;

    try {
        if (_isPaliReaderMode()) {
            if (prevPageNum >= state.paliFirstPage && !document.getElementById(`pali-page-${prevPageNum}`)) {
                await loadPaliPage(state.paliBookId, prevPageNum, null, false, true);
            }
        } else if (state.readerMode === "mm") {
            if (prevPageNum >= state.mmFirstPage && !document.getElementById(`mm-page-${prevPageNum}`)) {
                await loadMMPage(state.mmBookId, prevPageNum, false, false, true);
            }
        }
    } catch (e) {
        console.error(e);
    } finally {
        _feedLockRelease();
        if (el.btnLoadPrevPage) el.btnLoadPrevPage.disabled = false;
        pruneFeedDOM();
    }
}

let pageVisibilityObserver = null;
function setupPageVisibilityObserver() {
    try {
        if (pageVisibilityObserver) {
            pageVisibilityObserver.disconnect();
            pageVisibilityObserver = null;
        }
        if (typeof IntersectionObserver === "undefined") return;

        pageVisibilityObserver = new IntersectionObserver((entries) => {
            let bestEntry = null;
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    if (!bestEntry || entry.intersectionRatio > bestEntry.intersectionRatio) {
                        bestEntry = entry;
                    }
                }
            });

            if (bestEntry) {
                const p = parseInt(bestEntry.target.getAttribute("data-page"), 10);
                if (!isNaN(p)) {
                    updateCurrentViewPage(p);
                }
            }
        }, {
            root: el.readerContainer || null,
            rootMargin: "-5% 0px -40% 0px",
            threshold: [0.1, 0.3, 0.6]
        });

        document.querySelectorAll(".feed-page-item").forEach(sec => {
            pageVisibilityObserver.observe(sec);
        });
    } catch (e) {
        console.warn("setupPageVisibilityObserver error:", e);
    }
}

function updateCurrentViewPage(pageNum) {
    if (_isPaliReaderMode()) {
        if (state.paliPage === pageNum) return;
        state.paliPage = pageNum;
        el.metaPageNum.textContent = toMyanmarNum(pageNum);
        el.pageNumberInput.value = toMyanmarNum(pageNum);
        el.footerCurrentPage.textContent = toMyanmarNum(pageNum);
        el.btnPrevPage.disabled = (pageNum <= state.paliFirstPage);
        el.btnNextPage.disabled = (pageNum >= state.paliLastPage);
        updateBookmarkIconStatus();
        highlightActiveToc(pageNum);
        debounceRecent(state.paliBookId, pageNum);
    } else if (state.readerMode === "mm") {
        if (state.mmPage === pageNum) return;
        state.mmPage = pageNum;
        el.metaPageNum.textContent = toMyanmarNum(pageNum);
        el.pageNumberInput.value = toMyanmarNum(pageNum);
        el.footerCurrentPage.textContent = toMyanmarNum(pageNum);
        el.btnPrevPage.disabled = (pageNum <= state.mmFirstPage);
        el.btnNextPage.disabled = (pageNum >= state.mmLastPage);
        highlightActiveToc(pageNum);
        debounceRecent(state.mmBookId, pageNum);
    }
}

let recentDebounceTimer = null;
function debounceRecent(bookId, pageNum) {
    clearTimeout(recentDebounceTimer);
    recentDebounceTimer = setTimeout(() => {
        if (!bookId || !pageNum) return;
        const mode = state.readerMode || "pali";
        let bookName = "";
        let chapter = "";
        let splitMMBookId = null;
        let splitMMBookName = null;
        let splitMMPage = null;

        if (mode === "mm") {
            bookName = state.mmBookName || bookId;
            chapter = getCurrentChapterName("mm", pageNum);
        } else if (mode === "split") {
            bookName = state.paliBookName || bookId;
            chapter = getCurrentChapterName("pali", pageNum);
            splitMMBookId = state.mmBookId;
            splitMMBookName = state.mmBookName;
            splitMMPage = state.mmPage;
        } else {
            bookName = state.paliBookName || bookId;
            chapter = getCurrentChapterName("pali", pageNum);
        }

        HistoryManager.recordReading({
            mode: mode,
            bookId: bookId,
            bookName: bookName,
            page: pageNum,
            chapterName: chapter,
            splitMMBookId: splitMMBookId,
            splitMMBookName: splitMMBookName,
            splitMMPage: splitMMPage
        });
        // NOTE: the legacy global POST /api/recent was removed 2026-09-28.
        // It stored one shared row for ALL visitors (privacy leak); per-device
        // history now lives in HistoryManager and syncs via /api/sync.
    }, 600);
}

function showSentinelLoading(show) {
    if (!el.sentinelLoading) return;
    el.sentinelLoading.style.display = show ? "inline-flex" : "none";
}

function showSentinelEnd() {
    if (el.sentinelEnd) el.sentinelEnd.style.display = "block";
    if (el.sentinelLoading) el.sentinelLoading.style.display = "none";
}

let scrollToastTimer = null;
function showScrollToast(text) {
    if (!el.scrollPageToast || !el.scrollPageToastText) return;
    el.scrollPageToastText.textContent = text;
    el.scrollPageToast.classList.add("show");
    clearTimeout(scrollToastTimer);
    scrollToastTimer = setTimeout(() => {
        el.scrollPageToast.classList.remove("show");
    }, 1800);
}

function updateScrollIndicator(curPage, lastPage) {
    if (!el.pageScrollIndicator || !el.pageScrollIndicatorText) return;
    if (curPage < lastPage) {
        el.pageScrollIndicator.style.display = "flex";
        el.pageScrollIndicatorText.textContent = `နောက်စာမျက်နှာ (${toMyanmarNum(curPage + 1)}) သို့ ဆက်ရန် အောက်သို့ လှိမ့်ပါ`;
    } else {
        el.pageScrollIndicator.style.display = "flex";
        el.pageScrollIndicatorText.textContent = `ကျမ်းစာအုပ်၏ နောက်ဆုံးစာမျက်နှာသို့ ရောက်ရှိပါပြီ`;
    }
}

function setupFontSize(size) {
    if (size < 70) size = 70;
    if (size > 200) size = 200;
    state.fontSize = size;
    el.readerPaper.style.fontSize = `${1.25 * (size / 100)}rem`;
    el.splitPaliContent.style.fontSize = `${1.15 * (size / 100)}rem`;
    if (el.splitRightContent) el.splitRightContent.style.fontSize = `${1.15 * (size / 100)}rem`;
    if (el.splitMMContent && el.splitMMContent !== el.splitRightContent) el.splitMMContent.style.fontSize = `${1.15 * (size / 100)}rem`;
    el.fontSizeDisplay.textContent = `${size}%`;
    const fsMobile = document.getElementById("fontSizeDisplayMobile");
    if (fsMobile) fsMobile.textContent = `${size}%`;
    localStorage.setItem("tipitaka_font_size", size.toString());
}

function toMyanmarNum(num) {
    const mmDigits = ['၀', '၁', '၂', '၃', '၄', '၅', '၆', '၇', '၈', '၉'];
    return num.toString().replace(/\d/g, d => mmDigits[parseInt(d, 10)]);
}

function fromMyanmarNum(str) {
    if (!str) return 0;
    const mmDigits = {'၀': '0', '၁': '1', '၂': '2', '၃': '3', '၄': '4', '၅': '5', '၆': '6', '၇': '7', '၈': '8', '၉': '9'};
    const eng = str.toString().replace(/[၀-၉]/g, d => mmDigits[d] || d).replace(/[^\d]/g, '');
    return eng ? parseInt(eng, 10) : 0;
}

// Start app
window.addEventListener("DOMContentLoaded", initApp);

// ============================================================
// Header "More ⋮" Overflow Dropdown
// ============================================================
window.addEventListener("DOMContentLoaded", function () {
    const moreWrapper = document.getElementById("headerMoreDropdownWrapper");
    const moreBtn    = document.getElementById("btnHeaderMore");
    const moreMenu   = document.getElementById("headerMoreMenu");

    if (!moreBtn || !moreMenu || !moreWrapper) return;

    function openMoreMenu() {
        // Close other dropdowns first
        const scrollWrapper  = document.getElementById("scrollModeDropdownWrapper");
        const relatedWrapper = document.getElementById("relatedDropdownWrapper");
        if (scrollWrapper)  scrollWrapper.classList.remove("open");
        if (relatedWrapper) relatedWrapper.classList.remove("open");

        moreWrapper.classList.add("open");
        moreBtn.setAttribute("aria-expanded", "true");
    }

    function closeMoreMenu() {
        moreWrapper.classList.remove("open");
        moreBtn.setAttribute("aria-expanded", "false");
    }

    function toggleMoreMenu() {
        if (moreWrapper.classList.contains("open")) {
            closeMoreMenu();
        } else {
            openMoreMenu();
        }
    }

    // Toggle on button click — use capture:false, stopPropagation to prevent
    // the document-level handlers (scroll/related dropdown closers) from firing
    moreBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        e.preventDefault();
        toggleMoreMenu();
    });

    // Close when clicking anywhere outside the More wrapper
    document.addEventListener("click", function (e) {
        if (moreWrapper.classList.contains("open") && !moreWrapper.contains(e.target)) {
            closeMoreMenu();
        }
    });

    // Close on Escape key
    document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && moreWrapper.classList.contains("open")) {
            closeMoreMenu();
        }
    });

    // --- Mirror buttons inside More menu ---
    // Each mirror button: close menu, then trigger the real hidden button

    const btnMoreDict     = document.getElementById("btnMoreDict");
    const btnToggleDict   = document.getElementById("btnToggleDict");
    if (btnMoreDict && btnToggleDict) {
        btnMoreDict.addEventListener("click", function (e) {
            e.stopPropagation();
            closeMoreMenu();
            // Trigger real button
            btnToggleDict.dispatchEvent(new MouseEvent("click", { bubbles: false }));
        });
        // Sync active highlight in More menu when dict toggles
        const dictObserver = new MutationObserver(function () {
            btnMoreDict.classList.toggle("dict-active", btnToggleDict.classList.contains("active"));
        });
        dictObserver.observe(btnToggleDict, { attributes: true, attributeFilter: ["class"] });
    }

    const btnMoreFullscreen   = document.getElementById("btnMoreFullscreen");
    const btnToggleFullscreen = document.getElementById("btnToggleFullscreen");
    if (btnMoreFullscreen && btnToggleFullscreen) {
        btnMoreFullscreen.addEventListener("click", function (e) {
            e.stopPropagation();
            closeMoreMenu();
            btnToggleFullscreen.dispatchEvent(new MouseEvent("click", { bubbles: false }));
        });
    }

    const btnMoreHelp = document.getElementById("btnMoreHelp");
    const btnOpenHelp = document.getElementById("btnOpenHelp");
    if (btnMoreHelp && btnOpenHelp) {
        btnMoreHelp.addEventListener("click", function (e) {
            e.stopPropagation();
            closeMoreMenu();
            btnOpenHelp.dispatchEvent(new MouseEvent("click", { bubbles: false }));
        });
    }

    // --- Header overflow manager: a zoom-proof top bar ---
    // The bar holds ~2.9k px of controls. On narrower viewports — including
    // browser zoom, which shrinks the CSS viewport — flexbox used to crush
    // .header-left/.header-center (edition buttons, book title and page nav
    // vanished) and clip the rightmost button. Instead, measure the real
    // widths and move right-side tools that do not fit into this More menu,
    // and move them back when space returns. Left/center never shrink.
    var headerEl = document.querySelector(".app-header");
    var headerLeft = document.querySelector(".header-left");
    var headerCenter = document.querySelector(".header-center");
    var headerRight = document.querySelector(".header-right");
    var moreList = moreMenu.querySelector(".dropdown-list");
    // First entry moves out first. The two dropdown wrappers (scroll mode,
    // related commentary) are never moved — their popups cannot live inside
    // this menu — and the More button itself is never moved.
    var OVERFLOW_ORDER = [
        "btnOpenHelp", "btnToggleFullscreen", "btnToggleDict",
        "btnOpenHistory", "btnToggleNotes", "btnToggleNissaya",
        "btnCrossLinkNissaya", "btnCrossLink", "btnViewOriginalImage", "btnOpenSearch",
        "btnBookmarkToggle", "btnOpenEdition"
    ];
    var OVERFLOW_GROUPS = [".font-controls", ".theme-switcher"]; // moved last, as whole groups
    var MIRRORS = {
        btnToggleDict: "btnMoreDict",
        btnToggleFullscreen: "btnMoreFullscreen",
        btnOpenHelp: "btnMoreHelp"
    };
    var movedItems = []; // {node, mirror} in move order
    var origOrder = headerRight ? Array.from(headerRight.children) : [];

    // scrollWidth cannot detect overflow here: .app-header (and
    // .header-right) use overflow: visible, and for overflow:visible
    // elements scrollWidth reports the box width, not the overflowing
    // content — so the first version of this manager always thought the
    // bar fit and never moved anything. Measure the real widths instead:
    // the summed natural widths of each section's children, plus gaps
    // and the header's own padding.
    function contentWidth(el) {
        if (!el) return 0;
        var w = 0;
        var kids = el.children;
        for (var i = 0; i < kids.length; i++) w += kids[i].offsetWidth;
        var gap = parseFloat(getComputedStyle(el).gap) || 0;
        if (kids.length > 1) w += gap * (kids.length - 1);
        return w;
    }

    function headerFits() {
        if (!headerEl) return true;
        var style = getComputedStyle(headerEl);
        var padX = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
        var gap = parseFloat(style.gap) || 0;
        var total = contentWidth(headerLeft) + contentWidth(headerCenter) + contentWidth(headerRight)
            + padX + gap * 2;
        return total <= headerEl.clientWidth + 1;
    }

    function setMovedLabelVisibility(node, inMenu) {
        node.querySelectorAll(".btn-text").forEach(function (label) {
            if (inMenu) label.style.setProperty("display", "inline", "important");
            else label.style.removeProperty("display");
        });
        node.querySelectorAll(".kbd-shortcut").forEach(function (kbd) {
            if (inMenu) kbd.style.setProperty("display", "none", "important");
            else kbd.style.removeProperty("display");
        });
    }

    function moveToMenu(node) {
        var mirror = MIRRORS[node.id] ? document.getElementById(MIRRORS[node.id]) : null;
        if (mirror) mirror.style.display = "none";
        node.classList.add("in-more-menu");
        setMovedLabelVisibility(node, true);
        moreList.appendChild(node);
        movedItems.push({ node: node, mirror: mirror });
    }

    function restoreFromMenu(entry) {
        var node = entry.node;
        node.classList.remove("in-more-menu");
        setMovedLabelVisibility(node, false);
        if (entry.mirror) entry.mirror.style.display = "";
        // Put it back in its original slot: before the next original sibling
        // that is still in the bar, else at the end.
        var idx = origOrder.indexOf(node);
        var placed = false;
        for (var i = idx + 1; i < origOrder.length; i++) {
            if (origOrder[i].parentElement === headerRight) {
                headerRight.insertBefore(node, origOrder[i]);
                placed = true;
                break;
            }
        }
        if (!placed) headerRight.appendChild(node);
    }

    function nextMovable() {
        for (var i = 0; i < OVERFLOW_ORDER.length; i++) {
            var el = document.getElementById(OVERFLOW_ORDER[i]);
            if (el && el.parentElement === headerRight) return el;
        }
        for (var j = 0; j < OVERFLOW_GROUPS.length; j++) {
            var g = headerRight.querySelector(OVERFLOW_GROUPS[j]);
            if (g) return g;
        }
        return null;
    }

    function fitHeaderOverflow() {
        if (!headerEl || !headerRight || !moreList) return;
        if (headerEl.offsetParent === null) return; // header hidden (mobile reader view)
        if (window.innerWidth <= 768) {
            // Small screens: the CSS stages own the header; put everything back.
            while (movedItems.length) restoreFromMenu(movedItems.pop());
            moreWrapper.style.display = "";
            return;
        }
        // Bring items back while there is room (last moved = first back).
        while (movedItems.length) {
            var entry = movedItems[movedItems.length - 1];
            restoreFromMenu(entry);
            movedItems.pop();
            if (!headerFits()) {
                moveToMenu(entry.node); // does not fit after all — move it back out
                break;
            }
        }
        // Move items out until the bar fits.
        var guard = 0;
        while (!headerFits() && guard++ < 30) {
            var victim = nextMovable();
            if (!victim) break;
            moveToMenu(victim);
        }
        moreWrapper.style.display = movedItems.length ? "flex" : "";
    }

    // A moved tool is the real button: tapping it should also close this menu.
    moreList.addEventListener("click", function (e) {
        if (e.target.closest(".in-more-menu")) closeMoreMenu();
    });

    var fitTimer = null;
    function requestFitHeader() {
        if (fitTimer) clearTimeout(fitTimer);
        fitTimer = setTimeout(fitHeaderOverflow, 120);
    }
    window.addEventListener("resize", requestFitHeader);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { fitHeaderOverflow(); });
    window.addEventListener("load", function () { fitHeaderOverflow(); });
    setTimeout(fitHeaderOverflow, 600);
    fitHeaderOverflow();
    window.fitHeaderOverflow = fitHeaderOverflow;

    // Book/chapter titles change width when a book opens — re-fit then too.
    var badgeEl = document.getElementById("currentBookBadge");
    if (badgeEl && window.MutationObserver) {
        new MutationObserver(function () { requestFitHeader(); }).observe(badgeEl, { childList: true, characterData: true, subtree: true });
    }
});
