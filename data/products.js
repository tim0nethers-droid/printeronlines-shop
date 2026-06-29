function issue(title, icon, description, slug) {
  return { title, icon, description, slug };
}

function product(data) {
  const pageTitle = (data.pageTitle || `${data.name} Help Guide`).replace('Information Guide', 'Help Guide');
  const defaultCategories = (data.categories || []).slice(0, 4).map((item) => item.title.toLowerCase()).join(', ');
  return {
    ...data,
    subtitle: 'Independent resource - not affiliated with Microsoft Corporation',
    quickLinks: data.quickLinks || ['Common Issues', 'Setup Guidance', 'Submit Request', 'Request Chat', 'All Products'],
    pageTitle,
    seo: {
      title: `${pageTitle} | Independent Product Help Portal`,
      description: `Independent ${data.name} guide for ${defaultCategories || 'setup questions'} and service request guidance. Not affiliated with Microsoft Corporation.`,
      keywords: [
        `${data.name} help guide`,
        `${data.name} setup guidance`,
        `${data.name} service request`,
        `${data.name} troubleshooting guide`
      ]
    }
  };
}

const products = [
  product({
    slug: 'windows',
    name: 'Windows',
    pageTitle: 'Windows Information Guide',
    iconText: 'WIN',
    iconClass: 'windows',
    bannerClass: 'windows-banner',
    description: 'Windows installation, updates, activation, device settings, and performance guidance.',
    categories: [
      issue('Installation Help', 'PC', 'Guidance for Windows installation and setup questions.', 'installation-help'),
      issue('Update Issue', 'UPD', 'Help with Windows update errors, stuck updates, and restart loops.', 'update-issue'),
      issue('Activation Question', 'KEY', 'General guidance for activation messages and digital license questions.', 'activation-question'),
      issue('Performance Issue', 'SPD', 'Guidance for slow startup, lag, and performance settings.', 'performance-issue'),
      issue('Device Settings', 'SET', 'Help with display, sound, Bluetooth, printer, and device settings.', 'device-settings'),
      issue('Driver Guidance', 'DRV', 'Guidance for driver update and device compatibility questions.', 'driver-guidance')
    ],
    quickLinks: ['Installation Help', 'Update Issue', 'Activation Question', 'Performance Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'microsoft',
    name: 'Microsoft',
    pageTitle: 'Microsoft Information Guide',
    iconText: 'MS',
    iconClass: 'microsoft',
    bannerClass: 'microsoft-banner',
    description: 'General Microsoft product guidance, account sign-in guidance, product selection, setup questions, and service request help.',
    categories: [
      issue('Product Selection Help', 'MS', 'Guidance for choosing the right Microsoft product topic before submitting a request.', 'product-selection-help'),
      issue('Account Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords, one-time codes, or recovery codes.', 'account-sign-in-guidance'),
      issue('Setup Guidance', 'SET', 'Help with basic setup questions across Microsoft products and apps.', 'setup-guidance'),
      issue('Subscription Information Guidance', 'SUB', 'General subscription information guidance without collecting payment details.', 'subscription-information-guidance'),
      issue('App Installation Question', 'APP', 'Guidance for installing or locating Microsoft apps on your device.', 'app-installation-question'),
      issue('Service Request Help', 'HELP', 'Help choosing the right category and preparing a safe service request message.', 'service-request-help')
    ],
    quickLinks: ['Product Selection Help', 'Account Sign-in Guidance', 'Setup Guidance', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'excel',
    name: 'Microsoft Excel',
    pageTitle: 'Microsoft Excel Information Guide',
    iconText: 'X',
    iconClass: 'excel',
    bannerClass: 'excel-banner',
    description: 'Spreadsheet, formulas, data tables, charts, and workbook guidance.',
    categories: [
      issue('Formula Issue', 'fx', 'Get guidance for formula errors, calculations, and cell references.', 'formula-issue'),
      issue('File Opening Problem', 'DOC', 'Help with files not opening, corrupted workbook messages, or compatibility.', 'file-opening'),
      issue('Chart Help', 'BAR', 'Guidance for charts, graphs, and data visualization.', 'chart-help'),
      issue('Data Formatting', '123', 'Steps for number formats, tables, cell styles, and layout cleanup.', 'data-formatting'),
      issue('Workbook Setup', 'WB', 'Guidance for sheets, workbook structure, protection, and sharing setup.', 'workbook-setup'),
      issue('Printing Issue', 'PRN', 'Help with page breaks, print areas, scaling, and printer output.', 'printing-issue')
    ],
    quickLinks: ['Formula Issue', 'File Opening Problem', 'Workbook Setup', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'word',
    name: 'Microsoft Word',
    pageTitle: 'Microsoft Word Information Guide',
    iconText: 'W',
    iconClass: 'word',
    bannerClass: 'word-banner',
    description: 'Document formatting, templates, printing, and collaboration guidance.',
    categories: [
      issue('Document Formatting', 'Aa', 'Guidance for spacing, headings, page layout, and document styles.', 'document-formatting'),
      issue('Template Question', 'TPL', 'Help with creating, editing, and applying document templates.', 'template-question'),
      issue('Printing Issue', 'PRN', 'Steps for margins, page setup, printer output, and print preview problems.', 'printing-issue'),
      issue('File Opening Problem', 'DOC', 'Help with documents that will not open or show compatibility messages.', 'file-opening'),
      issue('Collaboration Help', 'COL', 'Guidance for comments, sharing, track changes, and coauthoring.', 'collaboration-help'),
      issue('PDF Export', 'PDF', 'Help saving, exporting, or formatting documents as PDF files.', 'pdf-export')
    ],
    quickLinks: ['Document Formatting', 'Template Question', 'PDF Export', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'powerpoint',
    name: 'Microsoft PowerPoint',
    pageTitle: 'Microsoft PowerPoint Information Guide',
    iconText: 'P',
    iconClass: 'powerpoint',
    bannerClass: 'powerpoint-banner',
    description: 'Presentation layout, media playback, templates, export, and slide guidance.',
    categories: [
      issue('Presentation Formatting', 'SLD', 'Guidance for layouts, themes, spacing, and slide consistency.', 'presentation-formatting'),
      issue('Media Playback', 'PLY', 'Help with audio, video, playback, and embedded media behavior.', 'media-playback'),
      issue('Template Question', 'TPL', 'Steps for using, editing, and creating presentation templates.', 'template-question'),
      issue('Export Issue', 'EXP', 'Help exporting presentations to PDF, video, or image formats.', 'export-issue'),
      issue('Slide Design', 'DSN', 'Guidance for visual hierarchy, slide structure, and readable layouts.', 'slide-design'),
      issue('Printing Issue', 'PRN', 'Help printing slides, notes, handouts, and custom page ranges.', 'printing-issue')
    ],
    quickLinks: ['Presentation Formatting', 'Media Playback', 'Export Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'outlook',
    name: 'Microsoft Outlook',
    pageTitle: 'Microsoft Outlook Information Guide',
    iconText: 'O',
    iconClass: 'outlook',
    bannerClass: 'outlook-banner',
    description: 'Email setup, send and receive issues, calendar behavior, and app configuration guidance.',
    categories: [
      issue('Email Setup', 'MAIL', 'Guidance for adding accounts and configuring mail settings.', 'email-setup'),
      issue('Send/Receive Issue', 'SYNC', 'Help with messages not sending, delayed delivery, or sync status.', 'send-receive-issue'),
      issue('Calendar Issue', 'CAL', 'Steps for calendar sharing, invites, reminders, and view problems.', 'calendar-issue'),
      issue('App Configuration', 'CFG', 'Guidance for profiles, signatures, rules, and app preferences.', 'app-configuration'),
      issue('Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'sign-in-guidance'),
      issue('Storage Question', 'GB', 'Help understanding mailbox size, cleanup, and archive options.', 'storage-question')
    ],
    quickLinks: ['Email Setup', 'Send/Receive Issue', 'Calendar Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'onedrive',
    name: 'Microsoft OneDrive',
    pageTitle: 'Microsoft OneDrive Information Guide',
    iconText: 'CLD',
    iconClass: 'onedrive',
    bannerClass: 'onedrive-banner',
    description: 'Cloud file sync, storage questions, sharing, and backup setup guidance.',
    categories: [
      issue('Sync Issue', 'SYNC', 'Guidance for files stuck syncing, sync pauses, and folder status.', 'sync-issue'),
      issue('Storage Question', 'GB', 'Help understanding storage usage, limits, and cleanup choices.', 'storage-question'),
      issue('File Sharing', 'SHR', 'Steps for sharing files, links, permissions, and access settings.', 'file-sharing'),
      issue('Backup Setup', 'BKP', 'Guidance for desktop, documents, pictures, and folder backup setup.', 'backup-setup'),
      issue('Upload Problem', 'UP', 'Help with uploads that fail, pause, or remain pending.', 'upload-problem'),
      issue('Download Problem', 'DL', 'Guidance for downloads, offline files, and file access behavior.', 'download-problem')
    ],
    quickLinks: ['Sync Issue', 'File Sharing', 'Backup Setup', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'teams',
    name: 'Microsoft Teams',
    pageTitle: 'Microsoft Teams Information Guide',
    iconText: 'T',
    iconClass: 'teams',
    bannerClass: 'teams-banner',
    description: 'Meeting join help, audio/video settings, sign-in guidance, and chat notifications.',
    categories: [
      issue('Meeting Join Help', 'JOIN', 'Guidance for joining meetings, links, waiting rooms, and guest access.', 'meeting-join-help'),
      issue('Audio/Video Settings', 'AV', 'Help with microphone, camera, speakers, and device selection.', 'audio-video-settings'),
      issue('Chat Notifications', 'BELL', 'Steps for notification settings, mentions, and chat alerts.', 'chat-notifications'),
      issue('Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'sign-in-guidance'),
      issue('Screen Sharing', 'SCR', 'Help with presenting screens, windows, and permissions.', 'screen-sharing'),
      issue('Team Setup', 'TEAM', 'Guidance for channels, members, teams, and collaboration setup.', 'team-setup')
    ],
    quickLinks: ['Meeting Join Help', 'Audio/Video Settings', 'Screen Sharing', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'microsoft-365',
    name: 'Microsoft 365',
    pageTitle: 'Microsoft 365 Information Guide',
    iconText: '365',
    iconClass: 'm365',
    bannerClass: 'm365-banner',
    description: 'Subscription, app install, sign-in, Office apps, and cloud sync guidance.',
    categories: [
      issue('Subscription Question', 'SUB', 'Guidance for plan details, renewals, and subscription information.', 'subscription-question'),
      issue('Install Apps', 'APP', 'Help installing desktop apps and checking app availability.', 'install-apps'),
      issue('Account Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'account-sign-in-guidance'),
      issue('Office Apps Help', 'DOC', 'Guidance for Word, Excel, PowerPoint, and related app behavior.', 'office-apps-help'),
      issue('OneDrive Sync', 'SYNC', 'Help with cloud sync, folders, and file status indicators.', 'onedrive-sync'),
      issue('Billing Information Guidance', 'BILL', 'General billing information guidance without collecting payment details.', 'billing-information-guidance')
    ],
    quickLinks: ['Subscription Question', 'Install Apps', 'Office Apps Help', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'copilot',
    name: 'Microsoft Copilot',
    pageTitle: 'Microsoft Copilot Information Guide',
    iconText: 'AI',
    iconClass: 'copilot',
    bannerClass: 'copilot-banner',
    description: 'Copilot availability, prompt guidance, app integration, and workspace settings.',
    categories: [
      issue('Availability Question', 'AI', 'Guidance for where Copilot features may appear and access basics.', 'availability-question'),
      issue('Prompt Guidance', 'TXT', 'Tips for clearer prompts, context, and expected output.', 'prompt-guidance'),
      issue('App Integration', 'APP', 'Help understanding Copilot behavior across supported apps.', 'app-integration'),
      issue('Response Quality', 'QA', 'Guidance for improving responses and checking generated content.', 'response-quality'),
      issue('Workspace Settings', 'SET', 'Information about workspace options and feature configuration.', 'workspace-settings'),
      issue('Privacy Question', 'LOCK', 'General guidance for privacy-aware use and content handling.', 'privacy-question')
    ],
    quickLinks: ['Prompt Guidance', 'App Integration', 'Response Quality', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-11',
    name: 'Windows 11',
    pageTitle: 'Windows 11 Information Guide',
    iconText: 'W11',
    iconClass: 'windows-11',
    bannerClass: 'windows-11-banner',
    description: 'Windows 11 upgrade, updates, activation, Start menu, network, and performance guidance.',
    categories: [
      issue('Upgrade Guidance', 'UPG', 'Guidance for Windows 11 upgrade checks, setup, and readiness questions.', 'upgrade-guidance'),
      issue('Update Issue', 'UPD', 'Help with Windows 11 update errors, stuck updates, and restart messages.', 'update-issue'),
      issue('Activation Question', 'KEY', 'General guidance for activation and digital license messages.', 'activation-question'),
      issue('Start Menu Issue', 'MENU', 'Help with Start menu, pinned apps, search, and layout behavior.', 'start-menu-issue'),
      issue('Wi-Fi or Network Issue', 'NET', 'Guidance for Wi-Fi, Ethernet, and network connection questions.', 'wifi-network-issue'),
      issue('Performance Issue', 'SPD', 'Guidance for slow performance, battery use, and responsiveness.', 'performance-issue')
    ],
    quickLinks: ['Upgrade Guidance', 'Update Issue', 'Start Menu Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-10',
    name: 'Windows 10',
    pageTitle: 'Windows 10 Information Guide',
    iconText: 'W10',
    iconClass: 'windows-10',
    bannerClass: 'windows-10-banner',
    description: 'Windows 10 updates, activation, drivers, printer setup, security, and performance guidance.',
    categories: [
      issue('Update Issue', 'UPD', 'Help with Windows 10 update errors, pending updates, and restart behavior.', 'update-issue'),
      issue('Activation Question', 'KEY', 'General guidance for activation messages and digital license questions.', 'activation-question'),
      issue('Slow Performance', 'SPD', 'Guidance for slow startup, lag, and performance settings.', 'slow-performance'),
      issue('Driver Guidance', 'DRV', 'Help understanding driver updates and device compatibility.', 'driver-guidance'),
      issue('Printer Setup', 'PRN', 'Guidance for printer setup, drivers, and print queue behavior.', 'printer-setup'),
      issue('Security Settings', 'SEC', 'Help with Windows security settings and protection status.', 'security-settings')
    ],
    quickLinks: ['Update Issue', 'Activation Question', 'Printer Setup', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-update',
    name: 'Windows Update',
    pageTitle: 'Windows Update Information Guide',
    iconText: '↻',
    iconClass: 'windows-update',
    bannerClass: 'windows-update-banner',
    description: 'Windows update failures, stuck updates, restart loops, error codes, and rollback guidance.',
    categories: [
      issue('Update Failed', 'FAIL', 'Guidance for updates that fail to install or show retry messages.', 'update-failed'),
      issue('Update Stuck', 'WAIT', 'Help with updates stuck downloading, installing, or pending restart.', 'update-stuck'),
      issue('Restart Loop', 'RST', 'Guidance for repeated restart prompts and boot loops after updates.', 'restart-loop'),
      issue('Error Code Guidance', 'ERR', 'General guidance for update error codes and next steps.', 'error-code-guidance'),
      issue('Update Settings', 'SET', 'Help with pause, schedule, active hours, and update preferences.', 'update-settings'),
      issue('Rollback Guidance', 'BACK', 'Information about rollback and uninstall update options.', 'rollback-guidance')
    ],
    quickLinks: ['Update Failed', 'Update Stuck', 'Error Code Guidance', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-security',
    name: 'Windows Security',
    pageTitle: 'Windows Security Information Guide',
    iconText: '🛡',
    iconClass: 'windows-security',
    bannerClass: 'windows-security-banner',
    description: 'Windows security settings, virus protection, firewall, account protection, and app protection guidance.',
    categories: [
      issue('Security Settings', 'SET', 'Guidance for reviewing Windows security settings and protection status.', 'security-settings'),
      issue('Virus Protection', 'SCAN', 'Help with scan status, protection messages, and virus protection settings.', 'virus-protection'),
      issue('Firewall Settings', 'FW', 'Guidance for firewall status, allowed apps, and network protection.', 'firewall-settings'),
      issue('Account Protection', 'ACCT', 'Help with account protection notices and sign-in security settings.', 'account-protection'),
      issue('Device Security', 'DEV', 'Guidance for device security, core isolation, and hardware security messages.', 'device-security'),
      issue('App Protection', 'APP', 'Help with app and browser protection settings.', 'app-protection')
    ],
    quickLinks: ['Security Settings', 'Virus Protection', 'Firewall Settings', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-activation',
    name: 'Windows Activation',
    pageTitle: 'Windows Activation Information Guide',
    iconText: '🔑',
    iconClass: 'windows-activation',
    bannerClass: 'windows-activation-banner',
    description: 'Windows activation messages, product key guidance, digital license guidance, and troubleshooting.',
    categories: [
      issue('Activation Question', 'KEY', 'General guidance for activation messages and license status.', 'activation-question'),
      issue('Product Key Guidance', 'PK', 'Information about product key messages without collecting keys.', 'product-key-guidance'),
      issue('Digital License Guidance', 'LIC', 'Guidance for digital license messages and account-linked activation.', 'digital-license-guidance'),
      issue('Activation Error', 'ERR', 'General guidance for activation errors and next steps.', 'activation-error'),
      issue('Edition Mismatch', 'ED', 'Help understanding edition mismatch messages and install edition checks.', 'edition-mismatch'),
      issue('Troubleshooting Guidance', 'HELP', 'Guidance for using built-in troubleshooting and collecting issue details.', 'troubleshooting-guidance')
    ],
    quickLinks: ['Activation Question', 'Product Key Guidance', 'Activation Error', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'windows-defender',
    name: 'Windows Defender',
    pageTitle: 'Windows Defender Information Guide',
    iconText: '🛡',
    iconClass: 'windows-defender',
    bannerClass: 'windows-defender-banner',
    description: 'Windows Defender scan guidance, threat alerts, security settings, firewall, and protection history.',
    categories: [
      issue('Scan Guidance', 'SCAN', 'Guidance for quick scans, full scans, and scan results.', 'scan-guidance'),
      issue('Threat Alert', 'ALT', 'Help understanding threat alerts and protection messages.', 'threat-alert'),
      issue('Security Settings', 'SET', 'Guidance for Defender security settings and protection status.', 'security-settings'),
      issue('Firewall Guidance', 'FW', 'Help with firewall status, allowed apps, and network protection basics.', 'firewall-guidance'),
      issue('Protection History', 'HIST', 'Guidance for reviewing protection history and recent actions.', 'protection-history'),
      issue('Exclusion Settings', 'EXC', 'Information about exclusion settings and safety considerations.', 'exclusion-settings')
    ],
    quickLinks: ['Scan Guidance', 'Threat Alert', 'Protection History', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'microsoft-edge',
    name: 'Microsoft Edge',
    pageTitle: 'Microsoft Edge Information Guide',
    iconText: 'E',
    iconClass: 'microsoft-edge',
    bannerClass: 'edge-banner',
    description: 'Browser setup, password guidance, extensions, downloads, privacy settings, and sync guidance.',
    categories: [
      issue('Browser Setup', 'WEB', 'Guidance for default browser settings, startup pages, and profiles.', 'browser-setup'),
      issue('Password Guidance only, no password collection', 'KEY', 'General password guidance without collecting or requesting passwords.', 'password-guidance'),
      issue('Extension Issue', 'EXT', 'Steps for managing browser extensions and permissions.', 'extension-issue'),
      issue('Download Issue', 'DL', 'Help with blocked downloads, save locations, and file handling.', 'download-issue'),
      issue('Privacy Settings', 'LOCK', 'Guidance for tracking prevention, cookies, and site permissions.', 'privacy-settings'),
      issue('Sync Guidance', 'SYNC', 'Help with favorites, history, profiles, and sync status.', 'sync-guidance')
    ],
    quickLinks: ['Browser Setup', 'Extension Issue', 'Privacy Settings', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'microsoft-store',
    name: 'Microsoft Store',
    pageTitle: 'Microsoft Store Information Guide',
    iconText: 'Store',
    iconClass: 'store',
    bannerClass: 'store-banner',
    description: 'Store app installs, downloads, purchase information guidance, login guidance, and app updates.',
    categories: [
      issue('App Install Issue', 'APP', 'Guidance for app installs, queue behavior, and installation messages.', 'app-install-issue'),
      issue('Download Stuck', 'WAIT', 'Help with downloads that are stuck, paused, or pending.', 'download-stuck'),
      issue('Purchase Information Guidance', 'BUY', 'General purchase information guidance without collecting payment details.', 'purchase-information-guidance'),
      issue('Store Login Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'store-login-guidance'),
      issue('App Update Issue', 'UPD', 'Help with app updates, pending updates, and update errors.', 'app-update-issue'),
      issue('Refund Information Guidance', 'REF', 'General information guidance for refund-related questions.', 'refund-information-guidance')
    ],
    quickLinks: ['App Install Issue', 'Download Stuck', 'App Update Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'onenote',
    name: 'OneNote',
    pageTitle: 'OneNote Information Guide',
    iconText: 'N',
    iconClass: 'onenote',
    bannerClass: 'onenote-banner',
    description: 'Notebook sync, sections, sharing, app configuration, and device setup guidance.',
    categories: [
      issue('Notebook Sync', 'SYNC', 'Guidance for notebooks that are not syncing or show sync warnings.', 'notebook-sync'),
      issue('Section Organization', 'SEC', 'Help with sections, pages, notebooks, and organization structure.', 'section-organization'),
      issue('Sharing Guidance', 'SHR', 'Steps for notebook sharing and access settings.', 'sharing-guidance'),
      issue('Device Setup', 'DEV', 'Guidance for using OneNote across desktop and mobile devices.', 'device-setup'),
      issue('App Configuration', 'CFG', 'Help with app preferences, accounts, and notebook locations.', 'app-configuration'),
      issue('Content Search', 'SRC', 'Guidance for finding notes, pages, tags, and notebook content.', 'content-search')
    ],
    quickLinks: ['Notebook Sync', 'Section Organization', 'Sharing Guidance', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'sharepoint',
    name: 'SharePoint',
    pageTitle: 'SharePoint Information Guide',
    iconText: 'S',
    iconClass: 'sharepoint',
    bannerClass: 'sharepoint-banner',
    description: 'SharePoint site access, document libraries, permissions, sharing, and page updates.',
    categories: [
      issue('Site Access', 'SITE', 'Guidance for site access, permissions, and navigation.', 'site-access'),
      issue('Document Library Issue', 'LIB', 'Help with libraries, metadata, views, and file organization.', 'document-library-issue'),
      issue('Permission Guidance', 'PERM', 'Steps for understanding sharing, groups, and access levels.', 'permission-guidance'),
      issue('File Sharing', 'SHR', 'Guidance for links, external sharing, and access settings.', 'file-sharing'),
      issue('Page Update Question', 'PAGE', 'Help editing pages, sections, web parts, and publishing changes.', 'page-update-question'),
      issue('List Setup', 'LIST', 'Guidance for lists, columns, filters, and views.', 'list-setup')
    ],
    quickLinks: ['Site Access', 'Permission Guidance', 'File Sharing', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'power-bi',
    name: 'Power BI',
    pageTitle: 'Power BI Information Guide',
    iconText: 'BI',
    iconClass: 'powerbi',
    bannerClass: 'powerbi-banner',
    description: 'Reports, data refresh, dashboards, workspace access, and sharing guidance.',
    categories: [
      issue('Report Issue', 'RPT', 'Guidance for report visuals, filters, pages, and layout behavior.', 'report-issue'),
      issue('Data Refresh', 'REF', 'Help with refresh schedules, credentials guidance, and dataset status.', 'data-refresh'),
      issue('Sharing Guidance', 'SHR', 'Steps for report sharing, links, apps, and access basics.', 'sharing-guidance'),
      issue('Workspace Access', 'WS', 'Guidance for workspace roles, membership, and visibility.', 'workspace-access'),
      issue('Dashboard Question', 'DASH', 'Help with tiles, dashboards, and pinned visuals.', 'dashboard-question'),
      issue('Data Model Help', 'DATA', 'Guidance for tables, relationships, and model structure.', 'data-model-help')
    ],
    quickLinks: ['Report Issue', 'Data Refresh', 'Workspace Access', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'surface',
    name: 'Surface',
    pageTitle: 'Surface Information Guide',
    iconText: 'SF',
    iconClass: 'surface',
    bannerClass: 'surface-banner',
    description: 'Surface setup, warranty information guidance, driver updates, and performance questions.',
    categories: [
      issue('Device Setup', 'DEV', 'Guidance for initial setup, accessories, display, and account setup basics.', 'device-setup'),
      issue('Warranty Information Guidance', 'WAR', 'General guidance for warranty information and service request preparation.', 'warranty-information-guidance'),
      issue('Driver/Update Guidance', 'DRV', 'Help understanding firmware, drivers, and update behavior.', 'driver-update-guidance'),
      issue('Performance Issue', 'SPD', 'Steps for slow performance, battery behavior, and device responsiveness.', 'performance-issue'),
      issue('Accessory Question', 'ACC', 'Guidance for pens, keyboards, docks, and external displays.', 'accessory-question'),
      issue('Display Issue', 'DSP', 'Help with brightness, touch, external monitors, and resolution.', 'display-issue')
    ],
    quickLinks: ['Device Setup', 'Driver/Update Guidance', 'Performance Issue', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'xbox',
    name: 'Xbox',
    pageTitle: 'Xbox Information Guide',
    iconText: 'XBOX',
    iconClass: 'xbox',
    bannerClass: 'xbox-banner',
    description: 'Console setup, Game Pass questions, sign-in guidance, and billing information requests.',
    categories: [
      issue('Console Setup', 'BOX', 'Guidance for first-time setup, display, network, and account basics.', 'console-setup'),
      issue('Game Pass Question', 'GAME', 'Information about membership features, downloads, and plan basics.', 'game-pass-question'),
      issue('Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'sign-in-guidance'),
      issue('Billing Information Request', 'BILL', 'General billing information guidance without collecting payment details.', 'billing-information-request'),
      issue('Network Settings', 'NET', 'Help with connectivity, NAT messages, and multiplayer basics.', 'network-settings'),
      issue('Controller Setup', 'CTRL', 'Guidance for controller pairing, updates, and input behavior.', 'controller-setup')
    ],
    quickLinks: ['Console Setup', 'Game Pass Question', 'Network Settings', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'azure',
    name: 'Azure',
    pageTitle: 'Azure Information Guide',
    iconText: 'AZ',
    iconClass: 'azure',
    bannerClass: 'azure-banner',
    description: 'Azure portal navigation, service setup, account basics, and resource guidance.',
    categories: [
      issue('Portal Navigation', 'NAV', 'Guidance for finding resources, dashboards, and portal settings.', 'portal-navigation'),
      issue('Service Setup Guidance', 'SVC', 'Help with basic setup steps for common Azure services.', 'service-setup-guidance'),
      issue('Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'sign-in-guidance'),
      issue('Billing Information Request', 'BILL', 'General billing information guidance without collecting payment details.', 'billing-information-request'),
      issue('Resource Configuration', 'CFG', 'Guidance for resource settings, regions, and configuration basics.', 'resource-configuration'),
      issue('Access Role Question', 'IAM', 'Help understanding permissions, roles, and access scope.', 'access-role-question')
    ],
    quickLinks: ['Portal Navigation', 'Service Setup Guidance', 'Resource Configuration', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'dynamics-365',
    name: 'Dynamics 365',
    pageTitle: 'Dynamics 365 Information Guide',
    iconText: 'D365',
    iconClass: 'dynamics',
    bannerClass: 'dynamics-banner',
    description: 'Dynamics access, records, dashboards, workflow behavior, and integration guidance.',
    categories: [
      issue('Access Guidance', 'KEY', 'Guidance for app access, roles, and environment visibility.', 'access-guidance'),
      issue('Records Issue', 'REC', 'Help with records, forms, views, and data entry behavior.', 'records-issue'),
      issue('Dashboard Question', 'DASH', 'Guidance for dashboards, charts, and filtered views.', 'dashboard-question'),
      issue('Integration Guidance', 'INT', 'General help with connected apps and data flow concepts.', 'integration-guidance'),
      issue('Workflow Behavior', 'FLOW', 'Steps for understanding process flows and workflow status.', 'workflow-behavior'),
      issue('Report Setup', 'RPT', 'Guidance for reports, exports, and business views.', 'report-setup')
    ],
    quickLinks: ['Access Guidance', 'Records Issue', 'Workflow Behavior', 'Submit Request', 'Request Chat']
  }),
  product({
    slug: 'skype',
    name: 'Skype',
    pageTitle: 'Skype Information Guide',
    iconText: 'SK',
    iconClass: 'skype',
    bannerClass: 'skype-banner',
    description: 'Skype calls, messaging, account access guidance, audio/video settings, and contacts.',
    categories: [
      issue('Call Quality', 'CALL', 'Guidance for audio quality, connection, and call stability.', 'call-quality'),
      issue('Messaging Issue', 'MSG', 'Help with chat delivery, notifications, and message behavior.', 'messaging-issue'),
      issue('Sign-in Guidance', 'KEY', 'General sign-in guidance without collecting passwords or codes.', 'sign-in-guidance'),
      issue('Audio/Video Settings', 'AV', 'Help with camera, microphone, speakers, and device selection.', 'audio-video-settings'),
      issue('Contacts Guidance', 'CNT', 'Steps for contacts, search, invites, and visibility settings.', 'contacts-guidance'),
      issue('App Configuration', 'CFG', 'Guidance for app preferences, startup, and device settings.', 'app-configuration')
    ],
    quickLinks: ['Call Quality', 'Messaging Issue', 'Audio/Video Settings', 'Submit Request', 'Request Chat']
  })
];

const seoOverrides = {
  excel: {
    title: 'Microsoft Excel Help Guide | Independent Product Help Portal',
    description: 'Find independent guidance for Microsoft Excel formulas, workbook setup, charts, file opening issues, and spreadsheet questions. Not affiliated with Microsoft Corporation.',
    keywords: ['Microsoft Excel guide', 'Excel formula help', 'Excel file opening issue', 'Excel chart help', 'Excel workbook setup']
  },
  word: {
    title: 'Microsoft Word Help Guide | Independent Product Help Portal',
    description: 'Independent Microsoft Word guide for document formatting, templates, printing, file opening, collaboration, and PDF export questions.',
    keywords: ['Microsoft Word guide', 'Word document formatting guide', 'Word template question', 'Word file opening problem', 'Word PDF export']
  },
  windows: {
    title: 'Windows Help Guide | Independent Product Help Portal',
    description: 'Independent Windows guide for installation, updates, activation questions, device settings, drivers, and performance guidance.',
    keywords: ['Windows help guide', 'Windows update guidance', 'Windows activation question guide', 'Windows driver guidance', 'Windows performance guidance']
  },
  'windows-11': {
    title: 'Windows 11 Help Guide | Independent Product Help Portal',
    description: 'Find independent Windows 11 guidance for upgrade questions, updates, activation, Start menu, Wi-Fi, and performance issues.',
    keywords: ['Windows 11 help guide', 'Windows 11 upgrade guidance', 'Windows 11 update issue', 'Windows 11 activation question', 'Windows 11 performance issue']
  },
  outlook: {
    title: 'Microsoft Outlook Help Guide | Independent Product Help Portal',
    description: 'Independent Outlook help guide for email setup, send/receive issues, calendar questions, app configuration, and sign-in guidance.',
    keywords: ['Microsoft Outlook help guide', 'Outlook setup guide', 'Outlook send receive issue', 'Outlook calendar issue', 'Outlook app configuration']
  }
};

products.forEach((item) => {
  if (seoOverrides[item.slug]) item.seo = seoOverrides[item.slug];
});

module.exports = products;
