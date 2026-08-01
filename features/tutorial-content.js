(function initTutorialContent(global) {
    function getTutorialFeatures(baseUrl) {
        return [
            {
                id: 'welcome',
                title: 'Welcome',
                icon: 'Home Icon.svg',
                content: [
                    { type: 'text', text: 'Explore new features and customisation options by clicking through the list on the left' },
                    { type: 'text', text: 'Customise your classroom using the tabs found above' },
                ]
            },
            {
                id: 'dark-mode',
                title: 'Dark Mode',
                icon: 'Moon.svg',
                content: [
                    { type: 'text', text: 'In the top left corner of Classroom, you will find the Dark Mode toggle.' },
                    { type: 'text', text: 'This button will display a sun or moon depending on the current theme. To switch between light and dark mode, simply click on the button and the new theme will fade in, replacing the old one.' },
                    { type: 'image', src: baseUrl + 'DarkToggle.jpeg', width: '60%' },
                ]
            },
            {
                id: 'sidebar-icons',
                title: 'Icons',
                icon: 'unset.svg',
                content: [
                    { type: 'text', text: 'When inside of a classroom, by hovering over the icon for that class in the sidebar, an edit icon will appear.' },
                    { type: 'text', text: 'Click this to bring up the icon customisation menu, where you can change the sidebar icon and colour for that classroom.' },
                    { type: 'text', text: 'You can also upload up to 14 of your own ".svg" files using the add button at the top of the icons list.' },
                    { type: 'text', text: 'Once you are finished, you are able to click any other icon in the sidebar to easily customise it.' },
                    { type: 'image', src: baseUrl + 'sideicon.jpeg', width: '50%' }
                ]
            },
            {
                id: 'classcolour',
                title: 'Classroom Colours',
                icon: 'Palette Icon.svg',
                content: [
                    { type: 'text', text: "The key colour found across an individual classroom can be changed by clicking the box in the lower right corner of that classroom's banner" },
                    { type: 'image', src: baseUrl + 'classcolour.jpeg', width: '60%'},
                ]
            }, 
            {
                id: 'nicknames',
                title: 'Nicknames',
                icon: 'Rename.svg',
                content: [
                    { type: 'text', text: 'On the home page, you can add or edit a classroom nickname by clicking the rename icon in the lower right of that classrooms widget.' },
                    { type: 'image', src: baseUrl + 'rename.jpeg', width: '60%'}
                ]
            },
            {
                id: 'classroom-banners',
                title: 'Banners',
                icon: 'editwidgimg.svg',
                content: [
                    { type: 'text', text: "Click the photo icon on a classroom's widget to bring up the banner editing panel" },
                    { type: 'text', text: "This will open to the banner selection panel, where you can choose or add a new banner to be used for that classroom" },
                    { type: 'image', src: baseUrl + 'banner.jpeg', width: '60%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: "You can add a tint to your banner by clicking the paint bucket icon, then adjusting the colour and opacity to your liking." },
                    { type: 'image', src: baseUrl + 'banner2.jpeg', width: '60%' },
                ]
            },
            {
                id: 'timetable',
                title: 'Timetable',
                icon: 'timetable.svg',
                content: [
                    { type: 'text', text: 'Open your timetable by clicking the Timetable button in the top right corner.' },
                    { type: 'image', src: baseUrl + 'ttpanel.jpeg', width: '50%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'This title displays what timetable is active, and the arrows allow you to navigate between them.' },
                    { type: 'image', src: baseUrl + 'tttitle.jpeg', width: '30%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'Pressing the pencil icon (edit button) will bring up the timetable creation and editing panel:' },
                    { type: 'image', src: baseUrl + 'ttedit.jpeg', width: '70%' },
                    { type: 'text', text: 'The left column shows the list of classes that you have added, and the right panel shows the details, linked Google classrooms, and periods.' },
                    { type: 'text', text: 'The Start and End times found at the top of the panel indicate the times that the timetable displays between.' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'Clicking the import button next to that will allow you to import your periods from your other timetables to your active one.' },
                    { type: 'image', src: baseUrl + 'ttimport.jpeg', width: '70%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'When you have added a period to a class, it will appear next to the timetable button when it is upcoming or in progress. Clicking these cards will take you to the corresponding class page. The coloured bar provides a visual indicator of how much time is left, which you can see by hovering.' },
                    { type: 'image', src: baseUrl + 'ttlive.jpeg' },
                ]
            },

            {
                id: 'notes',
                title: 'Notes',
                icon: 'notebook.svg',
                content: [
                    { type: 'text', text: 'The Notes panel can be found at the bottom right of your screen' },
                    { type: 'text', text: 'To the left of the panel you will find resizing options, the ability to fix the notes to the side of your screen, and the ability to keep the panel open when not fixed.' },
                    { type: 'break', size: 35 },                    
                    { type: 'text', text: 'The first tab, "Saved" displays all of your saved assignments.' },
                    { type: 'image', src: baseUrl + 'nstar.jpeg', width: '70%' },
                    { type: 'text', text: 'To save an assignment, simply click the star icon on the stream, or within the assignment itself.' },
                    { type: 'image', src: baseUrl + 'star1.jpeg', width: '70%' },
                    { type: 'text', text: '(Keep in mind if you save something from the stream, it will open the assignment and save it automatically from there)' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'The second tab, "To-Do" allows you to create a to-do list, where you can drag the bars that appear to adjust the order of the sections or to-do items.' },
                    { type: 'image', src: baseUrl + 'ntodo.jpeg', width: '70%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'The third tab, "Notes" allows you to write down any notes that you may need easy access to.' },
                    { type: 'image', src: baseUrl + 'nnote.jpeg', width: '70%' }                ]
            },
            {
                id: 'clock',
                title: 'Clock',
                icon: 'edithome.svg',
                content: [
                    { type: 'text', text: 'In the top left, you will find a clock widget, displaying your local time and temperature' },
                    { type: 'text', text: 'Click this widget to expand the settings, where you can toggle between 12 and 24 hour time, as well as between Celcius and Farenheit.' },
                    { type: 'image', src: baseUrl + 'Clock.jpeg', width: '100%' },
                ]
            },
            {
                id: 'folders',
                title: 'Folders',
                icon: 'fi-sr-folder.svg',
                content: [
                    { type: 'text', text: "The 'Folder Island' can be found at the top of the Home page." },
                    { type: 'text', text: "Click the + button to create and name a new folder" },
                    { type: 'image', src: baseUrl + 'folder.jpeg' },
                    { type: 'text', text: "Click the home icon to have the folder automatically open on reload." },
                    { type: 'text', text: "Use the other options to adjust the name, icon and colour, and select the classes to add to that folder." },
                ]
            },
            {
                id: 'sidebar-customisation',
                title: 'Settings',
                icon: 'newsettings.svg',
                content: [
                    { type: 'text', text: 'The settings panel features this tutorial, along with 3 tabs where you can customise the sidebar, background, and layout of Google Classroom.' },
                    { type: 'text', text: 'Here you can also find a "Feedback" button to provide bug reports or suggestions for what you want to see implemented' },
                    { type: 'image', src: baseUrl + 'Settings.jpeg' }
                ]
            },
        ];
    }

    global.getTutorialFeatures = getTutorialFeatures;
})(typeof window !== 'undefined' ? window : globalThis);
