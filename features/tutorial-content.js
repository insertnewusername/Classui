(function initTutorialContent(global) {
    function getTutorialFeatures(baseUrl) {
        return [
            {
                id: 'welcome',
                title: 'Welcome',
                icon: 'Home Icon.svg',
                content: [
                    { type: 'text', text: 'Use the navigation menu to the left to explore the different features and customisation options found around your new classroom.' },
                    { type: 'text', text: 'Feel free to report any issues or provide feedback through the feedback button in the settings menu.' },
                ]
            },
            {
                id: 'dark-mode',
                title: 'Dark Mode',
                icon: 'Moon.svg',
                content: [
                    { type: 'text', text: 'In the top left corner of Classroom, you will find the Dark Mode toggle.' },
                    { type: 'text', text: 'This button will display a sun or moon depending on the current theme. To switch between light and dark mode, simply click on the button and the new theme will fade in, replacing the old one.' },
                    { type: 'image', src: baseUrl + 'darklight.jpeg', width: '60%' },
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
                id: 'nicknames',
                title: 'Nicknames',
                icon: 'Rename.svg',
                content: [
                    { type: 'text', text: 'Pressing rename icon in the bottom right of each classroom widget will allow you to edit their nickname. This will be displayed across Google Classroom, making it easier to identify what class is which!' },
                    { type: 'image', src: baseUrl + 'rename.jpeg' }
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
                    { type: 'image', src: baseUrl + 'nnote.jpeg', width: '70%' },
                    { type: 'text', text: 'The fourth tab, "Class Tasks" displays all of your active classes. Click the + button to add a new column, which will allow you to easily indicate when regular tasks you may do for these classes are in progress or are complete.' },
                    { type: 'text', text: 'The list of classes is dependent on what classroom folder is open, and the order of these classes set on the home page. By hovering over a column header, you can delete or clear that column.' },
                    { type: 'image', src: baseUrl + 'ct.jpeg', width: '70%' },
                    { type: 'text', text: 'Click the clear button (Broom) in the sidebar to clear everything, or click the clear buttons that appear as you hover over class names or column headers to clear each one respectively.' },
                ]
            },
            {
                id: 'home-layout',
                title: 'Home Page',
                icon: 'edithome.svg',
                content: [
                    { type: 'text', text: 'By default, your home page will display a clock with the date and temperature, any scheduled classes, and your list of classrooms' },
                    { type: 'text', text: 'These can be toggled on or off, or customised using the edit button in the top right corner' },
                    { type: 'image', src: baseUrl + 'homeepic.jpeg', width: '70%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'Above your classrooms, there are three options: The first two toggle between expanded or compact widget styling...' },
                    { type: 'image', src: baseUrl + 'layout1.jpeg', width: '70%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: 'The settings button to the right of these allows you to adjust what is displayed on these home widgets.' },
                    { type: 'image', src: baseUrl + 'layout2.jpeg', width: '70%' }
                ]
            },
            {
                id: 'classcolour',
                title: 'Classroom Colours',
                icon: 'Palette Icon.svg',
                content: [
                    { type: 'text', text: "Click the grey box in the bottom right of the banner on a classroom stream to change the key colour of that class." },
                    { type: 'image', src: baseUrl + 'classcolour.jpeg' },
                ]
            },            
            {
                id: 'classroom-banners',
                title: 'Banners',
                icon: 'editwidgimg.svg',
                content: [
                    { type: 'text', text: "Click the photo icon on a classroom's widget to bring up the banner editing panel" },
                    { type: 'text', text: "The first tab allows you to select a custom banner image from the list, or upload your own. At the top of the sidebar, you'll find the close button above the reset button. (Resetting the banner will require you to refresh the page)" },
                    { type: 'image', src: baseUrl + 'banner.jpeg', width: '100%' },
                    { type: 'break', size: 35 },
                    { type: 'text', text: "By clicking the paint bucket in the sidebar, you bring up the tinting menu. Pick a colour and increase the opacity to your liking" },
                    { type: 'image', src: baseUrl + 'banner2.jpeg', width: '100%' },
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
                id: 'sidebar-icons',
                title: 'Icons',
                icon: 'unset.svg',
                content: [
                    { type: 'text', text: 'Double click an icon within the sidebar to edit its appearance and colour.' },
                    { type: 'text', text: 'You can also upload your own .svg files which can be used as a sidebar icon.' },
                    { type: 'image', src: baseUrl + 'sideicon.jpeg', width: '50%' }
                ]
            },
            {
                id: 'sidebar-customisation',
                title: 'Settings',
                icon: 'newsettings.svg',
                content: [
                    { type: 'text', text: 'Within the Settings panel, you are able to adjust your sidebar and classroom experience to best suit you and your needs.' },
                    { type: 'text', text: 'Additionally, you can click the "Feedback" button to provide bug reports or suggestions for what you want to see!' },
                    { type: 'image', src: baseUrl + 'setting.jpeg' }
                ]
            },
            {
                id: 'decoration',
                title: 'Decoration',
                icon: 'Picture Icon Font.svg',
                content: [
                    { type: 'text', text: 'At the bottom of the settings panel, you can chose from a variety of backgrounds to use across Google classroom, or you can upload your own.' },
                    { type: 'image', src: baseUrl + 'decor.jpeg' }
                ]
            }
        ];
    }

    global.getTutorialFeatures = getTutorialFeatures;
})(typeof window !== 'undefined' ? window : globalThis);
