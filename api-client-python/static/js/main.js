/*
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
"use strict";

var CALLSET_TYPE = "CALLSET";
var READSET_TYPE = "READSET";

function toggleUi(clazz, link) {
  $(".toggleable").hide();
  $("." + clazz).show();

  $('#mainNav li').removeClass('active');
  $(link).parent().addClass('active');
}

function showError(message) {
  showAlert(message, 'danger');
}

function showMessage(message) {
  showAlert(message, 'info');
}

function showAlert(message, type) {
  var alert = $('<div class="alert alert-info alert-dismissable"/>')
      .addClass('alert-' + type)
      .text(message).appendTo($("body"));
  closeButton().attr('data-dismiss', 'alert').appendTo(alert);
  alert.css('margin-left', -1 * alert.width()/2);

  setTimeout(function() {
    alert.alert('close')
  }, type == 'danger' ? 5000 : 3000);
}

function assert(condition) {
  if (!condition) {
    console.error('assert failed');
  }
}

function closeButton() {
  return $('<button type="button" class="close" aria-hidden="true">&times;</button>');
}

function getBackendName(backend) {
  return {GOOGLE : 'Google', LOCAL: 'Local'}[backend] || backend;
}

var loadedSetData = {};
function loadSet(readsetBackend, readsetIds, callsetBackends, callsetIds,
    opt_location, setType, id, backend) {
  if (_.has(loadedSetData, id)) {
    return false;
  }

  if (!backend) {
    showError('Backend for ' + id + ' isn\'t specified. ' +
      'The URL hash is malformed.');
    return;
  }

  showMessage('Loading data');

  $.getJSON('/api/sets', {backend: backend, setType: setType, setId: id})
    .done(function(res) {
      var sequenceData = _.sortBy(res.references,
        function(ref) { return parseInt(ref.name); });
      loadedSetData[id] = {id: id, name: res.name, type: setType,
        backend: backend, sequences: sequenceData};
      updateSets(readsetBackend, readsetIds, callsetBackends, callsetIds,
        opt_location);
    });
  return true;
}

function updateSets(readsetBackend, readsetIds, callsetBackends, callsetIds,
    opt_location) {
  // Load missing readsets
  for (var i = 0; i < readsetIds.length; i++) {
    if (loadSet(readsetBackend, readsetIds, callsetBackends, callsetIds,
        opt_location, READSET_TYPE, readsetIds[i], readsetBackend)) {
      // Wait for the set to callback
      return;
    }
  }

  // Load missing callsets
  for (var j = 0; j < callsetIds.length; j++) {
    if (loadSet(readsetBackend, readsetIds, callsetBackends, callsetIds,
        opt_location, CALLSET_TYPE, callsetIds[j], callsetBackends[j])) {
      // Wait for the set to callback
      return;
    }
  }

  updateListItems(READSET_TYPE, readsetIds, loadedSetData);
  updateListItems(CALLSET_TYPE, callsetIds, loadedSetData);

  // Update readgraph with new sets
  var setData = _.filter(loadedSetData, function(data) {
    return (_.contains(readsetIds, data.id) && data.type == READSET_TYPE) ||
      (_.contains(callsetIds, data.id) && data.type == CALLSET_TYPE);
  });

  readgraph.updateSets(setData);
  if (setData.length > 0 && opt_location) {
    readgraph.jumpGraph(opt_location);
  }
}

function updateListItems(setType, ids, loadedSetData) {
  $('#' + setType + 'Title').toggle(ids.length > 0);
  var setList = $('#active' + setType).empty();

  $.each(ids, function(i, id) {
    var setData = loadedSetData[id];
    var name = setData.name;

    var li = $('<li>', {'id': setType + '-' + id, 'class': 'list-group-item'})
      .appendTo(setList);

    closeButton().appendTo(li).click(function() {
      removeSet(id, setType);
      return false;
    });

    var displayName = getBackendName(setData.backend) + ": " + name;
    $('<div/>', {'class': 'setName'}).text(displayName).appendTo(li);
  });
}

function searchSets(button) {
  if (button) {
    button = $(button);
    button.button('loading');
  }

  var backend = $('#backend').val();
  var datasetSelector = $('#datasetId' + backend);
  var datasetId = datasetSelector.val();

  searchSetsOfType(button, READSET_TYPE, backend, datasetId);
  searchSetsOfType(button, CALLSET_TYPE, backend, datasetId);
}

function setSearchTab(setType) {
  $('.tab-pane').hide();
  $('.nav-tabs li').removeClass("active");
  $('#' + setType + 'Tab').addClass('active');
  $('#searchPane' + setType).show();
}

function searchSetsOfType(button, setType, backend, datasetId) {
  var tabPane = $('#searchPane' + setType);
  var div = tabPane.find('.results')
    .html('<img src="static/img/spinner.gif"/>');

  function getItemsOnPage(page) {
    return div.find('.list-group-item[page=' + page + ']');
  }

  var setsPerPage = 10;
  $.getJSON('/api/sets', {'backend': backend, 'datasetId': datasetId,
      'setType': setType, 'name': $('#setName').val()})
      .done(function(res) {
        div.empty();

        var pagination = tabPane.find('.paginationContainer');
        pagination.hide();

        var sets = res.readGroupSets || res.callSets;
        if (!sets) {
          div.html('No data found');
          return;
        }

        var totalPages = Math.ceil(sets.length / setsPerPage);

        $.each(sets, function(i, data) {
          var page = Math.floor(i / setsPerPage) + 1;
          $('<a/>', {'href': '#', 'class': 'list-group-item', 'page': page})
              .text(data.name).appendTo(div).click(function() {
            switchToSet(backend, setType, data.id);
            return false;
          }).hide();
        });
        getItemsOnPage(1).show();

        if (totalPages > 1) {
          pagination.show();
          pagination.bootpag({
            page: 1,
            total: totalPages,
            maxVisible: 10
          }).on("page", function(event, newPage) {
            div.find('.list-group-item').hide();
            getItemsOnPage(newPage).show();
          });
        }

      }).always(function() {
        button && button.button('reset');
      });
}


// Hash functions
function setAnchor(map) {
  window.location.hash = $.param(map, true);
}

var arrayKeys = ['backend', 'readsetId', 'cBackend', 'callsetId'];
function getAnchorMap() {
  var hashParts = window.location.hash.substring(1).split('&');
  var map = {};
  for (var i = 0; i < hashParts.length; i++) {
    var option = decodeURIComponent(hashParts[i]).split('=');
    var key = option[0];
    var value = option[1];

    if (!_.contains(arrayKeys, key)) {
      map[key] = value;
    } else if (map[key]) {
      map[key].push(value);
    } else {
      map[key] = [value];
    }
  }

  return map;
}

function removeSet(id, setType) {
  var state = getAnchorMap();
  var key = setType == READSET_TYPE ? 'readsetId' : 'callsetId';
  var backendKey = setType == READSET_TYPE ? 'backend' : 'cBackend';
  var setIndex = _.indexOf(state[key], id);
  state[key].splice(setIndex, 1);
  state[backendKey].splice(setIndex, 1);
  if (state[key].length == 0) {
    delete state[key];
  }
  if (state[backendKey].length == 0) {
    delete state[backendKey];
  }
  setAnchor(state);
}

function switchToSet(backend, setType, id) {
  var state = getAnchorMap();
  var key = setType == READSET_TYPE ? 'readsetId' : 'callsetId';

  if (setType == READSET_TYPE) {
    // TODO: Support multiple readsets at once
    state[key] = [id];
    state.backend = [backend];
  } else {
    state[key] = (state[key] || []);
    state[key].push(id);

    state.cBackend = (state.cBackend || []);
    state.cBackend.push(backend);
  }

  setAnchor(state);
  $('#setSearch').modal('hide');
}

function switchToLocation(location) {
  var state = _.extend(getAnchorMap(), {'location': location});
  setAnchor(state);
}

function updateUserLocation(location) {
  switchToLocation(readgraph.jumpGraph(location));
}

function handleHash() {
  var state = getAnchorMap();
  var readsetBackend = (state.backend || [])[0];
  if (readsetBackend) {
    $("#backend").val(readsetBackend); // TODO: Get rid of this?
  }

  updateSets(
    readsetBackend,
    (state.readsetId || []).slice(0, 1),
    state.cBackend || [],
    state.callsetId || [],
    state.location);
  if (state.location) {
    // Strip off the chromosome prefix
    var colonIndex = state.location.indexOf(":");
    var location = state.location.substring(colonIndex + 1);
    $("#readsetPosition").val(location);
  }
}


// Show the about popup when the page loads the first time, read the hash,
// and prep the initial set search
$(document).ready(function() {
  if (!sessionStorage.getItem('about-shown')) {
    sessionStorage.setItem('about-shown', true);
    $('#about').modal('show');
  }

  $(document).ajaxError(function(e, xhr) {
    showError('Sorry, the api request failed for some reason. ' +
        '(' + xhr.responseText + ')');
  });

  $(window).on('hashchange', handleHash);
  handleHash();

  $('#backend').change(function() {
    $('.datasetSelector').hide();
    $('#datasetId' + $(this).val()).show();
  }).change();

  // TODO: Simplify with general searchTab classes
  $("#READSETTab").click(function() {
    setSearchTab(READSET_TYPE);
    return false;
  });
  $("#CALLSETTab").click(function() {
    if ($(this).hasClass("disabled")) {
      return false;
    }
    setSearchTab(CALLSET_TYPE);
    return false;
  });

  searchSets();
});