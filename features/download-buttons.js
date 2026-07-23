(function() {
    'use strict';

    const downloadConfig = {
        attachmentElement: 'a[href*="drive.google.com/file"]:not(.downloadBtn)',
        downloadIconSVG: `<svg xmlns="http://www.w3.org/2000/svg" class="download-icon" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
            <path d="M480-313q-11 0-21-4t-18-13L270-513q-12-12-11.5-28t12.5-28q12-12 28.5-12.5T328-569l104 103v-278q0-17 11.5-28.5T472-784h16q17 0 28.5 11.5T528-744v278l104-103q12-12 28.5-11.5T699-569q12 12 12.5 28T699-513L519-330q-8 9-18 13t-21 4Z"/>
        </svg>`
    };

    function createDownloadButton(attachmentLink) {
        const button = document.createElement('a');
        button.className = 'downloadBtn';
        button.innerHTML = downloadConfig.downloadIconSVG + '<span>Download</span>';
        button.title = 'Download file';
        button.setAttribute('role', 'button');
        button.setAttribute('tabindex', '0');

        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            try {
                const driveURL = attachmentLink.getAttribute('href').split('?');
                const URLParams = new URLSearchParams(driveURL[1]);
                let driveId = driveURL[0].split('/').reverse()[1];

                let directDriveURL = `https://drive.google.com/uc?export=download&id=${driveId}`;
                if (URLParams.has('authuser')) {
                    directDriveURL = `${directDriveURL}&authuser=${URLParams.get('authuser')}`;
                }

                let fileName = 'file';
                try {
                    if (attachmentLink.children.length > 1 && attachmentLink.children[1].children[0]) {
                        fileName = attachmentLink.children[1].children[0].textContent.trim();
                    } else if (attachmentLink.textContent) {
                        fileName = attachmentLink.textContent.trim();
                    }
                } catch (e) {}

                const downloadLink = document.createElement('a');
                downloadLink.href = directDriveURL;
                downloadLink.download = fileName;
                document.body.appendChild(downloadLink);
                downloadLink.click();
                document.body.removeChild(downloadLink);
            } catch (error) {
                console.warn('Error downloading file:', error);
            }
        });

        return button;
    }

    function addDownloadButtons() {
        const attachmentElements = document.querySelectorAll(downloadConfig.attachmentElement);
        attachmentElements.forEach((elem) => {
            if (elem.querySelector('.downloadBtn')) return;
            const button = createDownloadButton(elem);
            elem.appendChild(button);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addDownloadButtons);
    } else {
        addDownloadButtons();
    }

    setTimeout(addDownloadButtons, 200);
    setTimeout(addDownloadButtons, 700);

    try {
        const attachmentsSelector = 'a[href*="drive.google.com/file"]';
        const lightObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof Element)) continue;

                    if (node.matches && node.matches(attachmentsSelector)) {
                        if (!node.querySelector('.downloadBtn')) {
                            node.appendChild(createDownloadButton(node));
                        }
                        continue;
                    }

                    if (node.querySelector) {
                        const found = node.querySelectorAll(attachmentsSelector);
                        if (found && found.length) {
                            found.forEach(el => {
                                if (!el.querySelector('.downloadBtn')) {
                                    el.appendChild(createDownloadButton(el));
                                }
                            });
                        }
                    }
                }
            }
        });

        lightObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        console.warn('Light attachment observer failed:', e);
    }

    // Periodic fallback: some Classroom re-renders replace anchors repeatedly
    // which can remove our appended buttons. Run a lightweight rescan every
    // second to ensure buttons are present. This is intentionally simple and
    // uses the existing `addDownloadButtons()` guard to avoid duplicates.
    try {
        const RESCAN_MS = 1000;
        const rescanHandle = setInterval(() => {
            try { addDownloadButtons(); } catch (e) {}
        }, RESCAN_MS);

        // Also observe removals and trigger a quick rescan when our button is
        // removed from the DOM so we reattach shortly after.
        const removalObserver = new MutationObserver((mutations) => {
            for (const m of mutations) {
                for (const node of m.removedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.classList && node.classList.contains('downloadBtn')) {
                        setTimeout(addDownloadButtons, 50);
                        continue;
                    }
                    if (node.querySelector && node.querySelector('.downloadBtn')) {
                        setTimeout(addDownloadButtons, 50);
                    }
                }
            }
        });

        removalObserver.observe(document.body, { childList: true, subtree: true });
    } catch (e) {
        console.warn('Download button fallback observers failed:', e);
    }
})();
