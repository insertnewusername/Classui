(function initTutorialContent(global) {
    function getTutorialFeatures(baseUrl) {
        return [
            {
                id: 'dark-mode',
                title: 'Dark Mode',
                icon: 'Moon.svg',
                thumbnail: 'Dark Mode.jpeg',
                content: [
                    { type: 'text', text: 'In the top left corner of Classroom, you will find the button to switch between light and dark mode.' },
                    { type: 'text', text: 'This button will display a sun or moon depending on the current theme, click it to switch between them.' },
                    { type: 'image', src: baseUrl + 'DarkToggle.jpeg', width: '40%' },
                ]
            },
            {
                id: 'search',
                title: 'Search',
                icon: 'Moon.svg',
                thumbnail: 'Dark Mode.jpeg',
                content: [
                    { type: 'text', text: 'At the bottom of your window, you will find a search button' },
                    { type: 'image', src: baseUrl + 'search1.jpeg', width: '70%' },
                    { type: 'text', text: 'By clicking this button, or using the shortcut shift + s, you can open the search panel' },
                    { type: 'text', text: 'This will allow you to search all of the assignment/material pages you have visited' },
                    { type: 'text', text: 'You can use partial search to easily search things such as an english poetry assignment by typing "eng poe"' },
                    { type: 'image', src: baseUrl + 'search2.jpeg', width: '70%' },
                ]
            },
            {
                id: 'sidebar-icons',
                title: 'Icons',
                icon: 'unset.svg',
                thumbnail: 'Icons.jpeg',
                content: [
                    { type: 'text', text: 'While on a classrooms page, hover over the icon for that class in the sidebar - this will change the icon to an edit icon.' },
                    { type: 'text', text: 'Click this to bring up the icon customisation menu, where you can change the sidebar colour and icon for that classroom.' },
                    { type: 'text', text: 'If you find a colour you particularly like, tap the + button next to the hex input to save it to the pallete. This will now appear in colour pickers across google classroom.' },
                    { type: 'text', text: 'You can also upload up to 14 of your own ".svg" icons using the add button at the top of the icons list.' },
                    { type: 'text', text: 'Once you are finished, you can click any other icon in the sidebar to continue customising, or anywhere else to dismiss the panel.' },
                    { type: 'image', src: baseUrl + 'sideicon.jpeg', width: '50%' }
                ]
            },
            {
                id: 'classcolour',
                title: 'Class Colours',
                icon: 'Palette Icon.svg',
                thumbnail: 'Classroom Colour.jpeg',
                content: [
                    { type: 'text', text: "The key colour applied to the assignments/materials icons within a classroom can be changed by clicking the box in the lower right corner of that classroom's banner" },
                    { type: 'image', src: baseUrl + 'classcolour1.jpeg', width: '60%'},
                    { type: 'image', src: baseUrl + 'classcolour2.jpeg', width: '60%'},
                ]
            }, 
            {
                id: 'nicknames',
                title: 'Nicknames',
                icon: 'Rename.svg',
                thumbnail: 'Nicknames.jpeg',
                content: [
                    { type: 'text', text: 'On the home page, you can add or edit a classroom nickname by clicking the rename icon in the lower right of that classrooms widget.' },
                    { type: 'image', src: baseUrl + 'rename.jpeg', width: '80%'}
                ]
            },
            {
                id: 'classroom-banners',
                title: 'Banners',
                icon: 'editwidgimg.svg',
                thumbnail: 'Banners.jpeg',
                content: [
                    { type: 'text', text: "Click the photo icon on a classroom's widget to bring up the banner customisation panel" },
                    { type: 'text', text: "This will open to the banner selection panel, where you can choose or add a new banner to be used for that classroom" },
                    { type: 'image', src: baseUrl + 'banner.jpeg', width: '60%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: "Clicking the paint bucket icon will open the tint panel, where you can adjust the hue and opacity of a colour wash over your chosen banner image" },
                    { type: 'image', src: baseUrl + 'banner2.jpeg', width: '60%' },
                ]
            },
            {
                id: 'timetable',
                title: 'Timetable',
                icon: 'timetable.svg',
                thumbnail: 'Timetable.jpeg',
                content: [
                    { type: 'text', text: 'Open your timetable by clicking the Timetable button in the top right corner.' },
                    { type: 'image', src: baseUrl + 'ttpanel.jpeg', width: '50%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'From here, you can see your active timetable, where you can use the arrows either side to navigate between three seperate timetables.' },
                    { type: 'image', src: baseUrl + 'tttitle.jpeg', width: '70%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'Pressing the edit button to the right of the title will show the timetable creation panel:' },
                    { type: 'image', src: baseUrl + 'ttedit.jpeg', width: '70%' },
                    { type: 'text', text: 'On the left, you will see a list of added classes, type the name of a class in the "new class" field to add a new one.' },
                    { type: 'text', text: 'Additionally, you can select the "Blocks" tab, allowing you to create pre-set days using your classes that can be dragged to fill a day with that template instantly.' },
                    { type: 'text', text: 'On the right, you will see the details for each class at the top, where you can change things such as the colour, name, teacher, and linked classroom (Meaning when you click on this periods live widget, it will take you to that classroom)' },
                    { type: 'text', text: 'Under this, you will find the timetable editing panel. Drag classes or blocks from the sidebar, then drag these periods around or manually type to mark their start and end times.' },
                    { type: 'text', text: 'You can. also switch to period view, which shows you all added periods for each day, allowing you to quickly edit multiple periods if required.' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'Clicking the import button at the end of the tab list will allow you to import your periods from your other timetables to your active one.' },
                    { type: 'image', src: baseUrl + 'ttimport.jpeg', width: '85%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'When you have added a period to a class, it will appear next to the timetable button when it is upcoming or in progress. Clicking these cards will take you to the corresponding class page. The coloured bar provides a visual indicator of how much time is left, which you can see by hovering.' },
                    { type: 'image', src: baseUrl + 'ttlive.jpeg' },
                ]
            },

            {
                id: 'notes',
                title: 'Notes',
                icon: 'notebook.svg',
                thumbnail: 'Notes.jpeg',
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
                thumbnail: 'Clock.jpeg',
                content: [
                    { type: 'text', text: 'On your home page, you will notice a large clock front and centre above your classes' },
                    { type: 'text', text: 'Click on this clock to bring up appearance settings, where you can change things such as alignment, colour, or font.' },
                    { type: 'image', src: baseUrl + 'ClockBig.jpeg', width: '75%' },
                    { type: 'text', text: 'You can also set a collapsed view, meaning instead of a large clock, a small pill-shaped clock will sit in the top-left corner' },
                    { type: 'text', text: '(This pill clock is shown on all other pages outside of the home page' },
                    { type: 'image', src: baseUrl + 'Clock.jpeg', width: '75%' },
                ]
            },
            {
                id: 'folders',
                title: 'Folders',
                icon: 'fi-sr-folder.svg',
                thumbnail: 'Folders.jpeg',
                content: [
                    { type: 'text', text: "The 'Folder Island' can be found at the top of the Home page." },
                    { type: 'text', text: "Click the + button to create and name a new folder" },
                    { type: 'image', src: baseUrl + 'folder.jpeg', width: '85%' },
                    { type: 'text', text: "Click the home icon to have the folder automatically open on reload." },
                    { type: 'text', text: "Use the other options to adjust the name, icon/colour, and add/remove classes from that folder." },
                ]
            },
            {
                id: 'home-layout',
                title: 'Home Layout',
                icon: 'fi-sr-folder.svg',
                thumbnail: 'Folders.jpeg',
                content: [
                    { type: 'text', text: "The two rectangularly-labelled buttons can be used to toggle between regular and collapsed classroom widget view" },
                    { type: 'image', src: baseUrl + 'miniwidget.jpeg', width: '75%' },
                    { type: 'text', text: "By clicking the settings icon to the right of those options, you will open up the advanced home layout settings" },
                    { type: 'text', text: "From here, you can adjust the visibility of components such as the 'due soon' section or the teacher profile on each classroom widget." },
                    { type: 'image', src: baseUrl + 'homelayout.jpeg', width: '75%' },
                ]
            },
        ];
    }

    global.getTutorialFeatures = getTutorialFeatures;
})(typeof window !== 'undefined' ? window : globalThis);
