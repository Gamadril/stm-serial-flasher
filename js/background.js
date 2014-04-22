chrome.app.runtime.onLaunched.addListener(function () {
    chrome.app.window.create('index.html', {
        id: 'fakedIdForSingleInstance',
        singleton: true,

        'bounds': {
            'width': 700,
            'height': 400
        },
        'maxWidth': 700,
        'maxHeight': 400,
        'minWidth': 700,
        'minHeight': 400
    });
});



