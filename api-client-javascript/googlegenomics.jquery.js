/**
Copyright 2014 Google Inc. All rights reserved.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * This jquery plugin wraps Google's javascript client library with
 * helper functions to make fetching genomics data a bit easier.
 *
 * To use, setup the genomics API at the top of your code:
 *
 *   $.initGenomics({clientId: 'your-client-id-goes-here'});
 *
 * Then get genomics data by using the authGenomics function with a callback:
 *
 *   $.authGenomics(function() {
 *     gapi.client.genomics.datasets.get(datasetId).execute(function(json) {
 *       // Do something with the json that comes back
 *     });
 *   });
 *
 * The initGenomics function also supports the use of non-genomics scopes and
 * libraries through the options parameter.
 */
(function ($) {
  var settings;

  function authUser(invisibleAuth, callback) {
    var params = {client_id: settings.clientId, scope: settings.scopes,
      immediate: invisibleAuth};
    gapi.auth.authorize(params, function(authResult) {
      checkAuth(authResult, invisibleAuth, callback);
    });
  }

  function checkAuth(authResult, invisibleAuth, callback) {
    if (authResult && !authResult.error) {
      settings.userAuthorized = true;
      callback();
    } else if (invisibleAuth) {
      callback();
    } else {
      // Something went wrong with the auth flow
      throw new Error("Authorization failed");
    }
    // Note: If the user simply closes the auth popup, we (apparently)
    // won't have any idea.
    // TODO: Add a timeout to this plugin which cancels the call
    // and supports an error callback
  }

  // Don't call this directly! It's necessary & only used by
  // the Google Javascript Client library. The client library also requires
  // this global scope definition.
  window['genomicsOnload'] = function() {
    $.each(settings.libraries, function(i, library) {
      // TODO: Pass a real callback and delay initCallback execution
      gapi.client.load(library.name, library.version, function() {});
    });

    authUser(true, settings.initCallback || function(){});
  };

  // Wraps jQuery's ajax with useful defaults - including an authorization
  // header, error handler, and json type setting.
  //
  // The path parameter is a relative genomics path, like '/readsets/search'
  // The correct base url will be prepended.
  //
  // When using this function, you do not need to make calls to $.authGenomics
  // nor use the initCallback option in $.initGenomics.
  //
  // Example usage:
  //  $.initGenomics({clientId: clientId});
  //  $.genomicsAjax('/datasets/10473108253681171589', {
  //      success: function(dataset) { alert("Dataset: " + dataset.name); }
  //  });
  //
  $.genomicsAjax = function(path, options) {
    var version = options.version || 'v1beta';
    $.authGenomics(function() {
      $.ajax($.extend({
        url: 'https://www.googleapis.com/genomics/' + version + path,
        contentType: 'application/json; charset=utf-8',
        dataType: 'json',
        beforeSend: function (request) {
          request.setRequestHeader('Authorization',
            'Bearer ' + gapi.auth.getToken().access_token);
        },
        error: function(xhr) {
          alert("API call failed: " + xhr.responseJSON.error.message);
        }
      }, options))
    });
  };

  // This method asks the user for permission to read genomics data.
  // (If access has already been granted, then the asking will be invisible)
  //
  // Inside of the callback, use the gapi.client.genomics.* calls to fetch data.
  $.authGenomics = function(callback) {
    if (!settings) {
      throw new Error("$.initGenomics must be called first.");
    }
    if (settings.userAuthorized) {
      callback();
    } else if (window['gapi']) {
      authUser(false, callback);
    } else {
      // The API hasn't loaded yet, queue the callback
      var oldCallback = settings.initCallback;
      var newCallback = function() { $.authGenomics(callback) };
      settings.initCallback = !oldCallback ? newCallback : function() {
        newCallback();
        oldCallback();
      }
    }
  };

  // This method must be called to setup the genomics apis.
  // This loads an additional script file, and calls the gapi load function.
  $.initGenomics = function(options) {
    settings = $.extend({
        // These are the defaults.
        clientId: '',
        scopes: ['https://www.googleapis.com/auth/genomics'],
        libraries: [{name: 'genomics', version: 'v1beta'}],
        initCallback: null
    }, options);

    // Check the clientId field
    if (!settings.clientId || settings.clientId == 'your-client-id-goes-here') {
      alert('You need to provide a real clientId to use this code. ' +
          'Check the README for more instructions.');
      return;
    }

    $.getScript('https://apis.google.com/js/client.js?onload=genomicsOnload');
  };
}(jQuery));
