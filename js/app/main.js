/*global require, requirejs */

requirejs.config({
    baseUrl: 'js/lib',
    paths: {
        app: '../app'
    }
});

require(['app/controllers/AppController'], function (AppController) {
    new AppController();
});
