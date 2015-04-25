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

var readgraph = new function() {
  var width = 0;
  var height = 800;
  var margin = 40;

  var textHeight, textWidth = 0;

  var y = d3.scale.linear().range([margin, height - margin*2]);
  var x = d3.scale.linear();
  var xAxis = d3.svg.axis().ticks(5).scale(x);
  var xFormat = d3.format(',f');

  var zoom = null;
  var maxZoom = 1;
  var zoomLevelChange = 1;
  var minRange = 0;

  var opacity = d3.scale.linear().domain([0, 93]).range([.2, 1]);
  var unsupportedMessage = null;

  // Current state
  // Format: {id, type, backend, sequences}
  var setObjects = [];
  var mergedSequences = [];
  var currentSequence = null;

  var readTrackLength = 0;
  var callsetTrackLength = 0;

  // Dom elements
  var svg, axisGroup, readGroup, readDiv, variantDiv, spinner = null;
  var hoverline, positionIndicator, positionIndicatorBg, positionIndicatorText;

  var updateHeight = function() {
    height = (readTrackLength + callsetTrackLength) * textHeight + 100;
    height = Math.max(height, 450);
    var totalTracks = (height - 100) / textHeight;

    y.range([margin, height - margin*2]).domain([totalTracks, -1]);
    $('#graph').height(height);

    // TODO: Reduce duplicate height setting code
    axisGroup.attr('transform', 'translate(0,' + (height - margin) + ')');
    positionIndicatorBg.attr('height', height - margin);
    positionIndicatorText.attr('y', height - margin - textHeight);
    hoverline.attr("y2", height);

    zoom.size([width, height]);

    return totalTracks;
  };

  var clamp = function(x, min, max) {
    return Math.min(Math.max(x, min), max);
  };

  var getScaleLevel = function() {
    return Math.floor(Math.log(zoom.scale()) / Math.log(zoomLevelChange) + .1);
  };

  var getReadStats = function(position) {
    var reads = readCache.getReads().filter(function(read) {
      return overlaps(read.position, read.end, position, position);
    });
    if (reads.length > 0 &&
      _.every(reads, function(read) { return read.readPieces.length > 0 })) {
      return _.countBy(_.map(reads, function(read) {
        return read.readPieces[position - read.position].letter;
      }));
    }
    return null;
  };

  // Called at high frequency for any navigation of the UI (not just zooming).
  // Should only do low-latency operations.
  var handleZoom = function() {
    // Limit the domain (without changing the scale).  D3 should really
    // handle this for us, see https://github.com/mbostock/d3/issues/1084.
    // Note that we don't want to reset the domain itself because that
    // also resets the scale and translation.
    if (x.domain()[0] < 1) {
      zoom.translate([zoom.translate()[0] - x(1) + x.range()[0], 0]);
    } else if (x.domain()[1] > currentSequence.length) {
      zoom.translate([zoom.translate()[0] - x(currentSequence.length) + x.range()[1], 0]);
    }
    svg.select(".axis").call(xAxis);

    // Update scale bar
    d3.select('.zoomLevel').attr('y', (6 - getScaleLevel()) * 24 + 38);
    updateDisplay();
  };

  // Called when a navigation operation has completed.  This is the place to
  // do more expensive operations than simple UI updates.  Should not be
  // called frequently.
  var handleZoomEnd = function() {
    handleZoom();
    var scaleLevel = getScaleLevel();
    if (scaleLevel >= 4) {
      var sequenceStart = parseInt(x.domain()[0]);
      var sequenceEnd = parseInt(x.domain()[1]);
      ensureReadsCached(sequenceStart, sequenceEnd, scaleLevel > 5);
    }
  };

  var moveToSequencePosition = function(position) {
    position = clamp(position, 1, currentSequence.length);

    var newX = x(position);
    newX = zoom.translate()[0] - newX + width / 2;
    zoom.translate([newX, 0]);
  };

  var setupRun = false;
  var setup = function() {
    setupRun = true;

    // Measurements
    svg = d3.select("#graph");
    var text = addText(svg, 'G', 0, 0);
    var bbox = text.node().getBBox();
    textWidth = bbox.width;
    textHeight = bbox.height;
    text.remove();

    width = $('#graph').width();
    x.rangeRound([margin, width - margin]);
    minRange = (width / textWidth / 2); // Twice the zoom of individual bases

    readDiv = $('#readDiv');
    variantDiv = $('#variantDiv');


    // Svg init
    // Reads Axis
    axisGroup = svg.append('g')
        .attr('transform', 'translate(0,' + (height - margin) + ')')
        .attr('class', 'axis');

    // Unsupported message
    unsupportedMessage = addText(svg, 'This zoom level is coming soon!',
        width/2, height/4);

    // Hover line
    hoverline = svg.append("line")
        .attr("class", "hover hoverline")
        .attr("x1", 0).attr("x2", 0)
        .attr("y1", 0).attr("y2", height);

    var hovertext = svg.append('text')
        .attr("class", "hover hovertext")
        .attr('y', textHeight);

    svg.on("mousemove", function() {
      var mouseX = d3.mouse(this)[0];
      mouseX = clamp(mouseX, margin, width - margin);

      if (mouseX > width * 2/3) {
        hovertext.attr('x', mouseX - 3).style('text-anchor', 'end');
      } else {
        hovertext.attr('x', mouseX + 3).style('text-anchor', 'start');
      }

      var position = Math.floor(x.invert(mouseX));
      hovertext.selectAll('tspan').remove();
      hovertext.append('tspan').text(xFormat(position));

      var readStats = getReadStats(position);
      if (readStats) {
        hovertext.append('tspan')
            .attr('y', textHeight*2).attr('x', hovertext.attr('x'))
            .text(_.reduce(readStats, function(memo, num, key) {
              return memo + num + key + " ";
            }, ""));
      }

      hoverline.attr("x1", mouseX).attr("x2", mouseX)
    });

    // Position indicator
    positionIndicator = svg.append('g')
        .attr('transform', 'translate(0,0)')
        .attr('class', 'axis');
    positionIndicatorBg = positionIndicator.append('rect')
        .attr('class', 'positionIndicator background')
        .attr('x', 0).attr('y', 0)
        .attr('width', textWidth * 1.5).attr('height', height - margin);
    positionIndicatorText = positionIndicator.append('text')
        .attr('class', 'positionIndicator text')
        .attr('x', 3)
        .attr('y', height - margin - textHeight);
    toggleVisibility(positionIndicator, false);

    // Groups
    readGroup = svg.append('g').attr('class', 'readGroup');
    var zoomGroup = svg.append('g').attr('class', 'zoomGroup');

    // Zooming
    var changeZoomLevel = function(levelChange) {
      var newZoom = zoom.scale();
      // Keep the graph centered on the middle position
      var middleX = x.invert(width / 2);

      if (levelChange > 0) {
        newZoom = zoom.scale() * zoomLevelChange;
      } else {
        newZoom = zoom.scale() / zoomLevelChange;
      }
      newZoom = clamp(newZoom, 1, maxZoom);
      zoom.scale(newZoom);
      moveToSequencePosition(middleX);
    };

    zoom = d3.behavior.zoom().size([width, height]).on("zoom", handleZoom).on("zoomend", handleZoomEnd);
    svg.call(zoom);

    // Zoom background
    zoomGroup.append('rect')
        .attr('x', 23).attr('y', 35)
        .attr('width', 66).attr('height', 170);

    addImage(zoomGroup, 'zoom-bar.png', 10, 201, 7, 10);
    addImage(zoomGroup, 'zoom-level.png', 22, 15, 2, 183, null, 'zoomLevel');
    addImage(zoomGroup, 'zoom-plus.png', 25, 25, 0, 10, function() {
      changeZoomLevel(1);
    });
    addImage(zoomGroup, 'zoom-minus.png', 25, 25, 0, 200, function() {
      changeZoomLevel(-1);
    });
    var zoomTextX = 23;
    addText(zoomGroup, 'Bases', zoomTextX, 50);
    addText(zoomGroup, 'Reads', zoomTextX, 98);
    addText(zoomGroup, 'Coverage', zoomTextX, 147);
    addText(zoomGroup, 'Summary', zoomTextX, 195);

    // Spinner
    spinner = addImage(readGroup, 'spinner.gif', 16, 16, width - 16, 0);
    spinner.style('display', 'none');
  };

  var chrLocation = /^(.*):(\d*)$/;

  // Jumps the graph to the given user-entered position
  // Returns a bookmarkable position value
  this.jumpGraph = function(location) {
    var jumpResults = $("#jumpResults").empty();

    // Locations of the form chr:position
    if (chrLocation.test(location)) {
      var matches = chrLocation.exec(location);
      jumpToPosition(parseInt(matches[2].replace(/,/g, '')), matches[1], true);
      return location;
    }

    var position = parseInt(location.replace(/,/g, ''));
    // Numbered locations
    if (position > 0) {
      jumpToPosition(position, null, true);
      return currentSequence.name + ":" + position;
    }

    // Queried locations
    showMessage('Looking up location: ' + location);

    $.getJSON('api/snps', {snp: location}).done(function(res) {
      if (res.snps.length == 0) {
        showMessage('Could not find location: ' + location);

      } else {
        $.each(res.snps, function(i, snp) {
          var listItem = $('<a/>', {'href': '#', 'class': 'list-group-item'})
              .appendTo(jumpResults).click(function() {
                if (snp.position) {
                  jumpToPosition(snp.position, snp.chr, true, snp.name);
                } else {
                  showMessage('Could not find a position for this snp.' +
                      ' Check SNPedia for more information.');
                }
                return false;
              });
          $('<span>', {'class': 'title'}).text(snp.name + ' ')
              .appendTo(listItem);
          $('<a>', {'href': snp.link, 'target': '_blank'}).text('SNPedia')
              .appendTo(listItem).click(function() {
                window.open(snp.link);
                return false;
              });
          if (snp.position) {
            $('<div>').text('chr ' + snp.chr + ' at ' + xFormat(snp.position))
                .appendTo(listItem);
          }
        });

        $("#jumpResults .list-group-item").click();
      }
    });
    return location;
  };

  var fuzzyFindSequence = function(chr) {
    var actualNames = _.pluck(mergedSequences, 'name');
    var possibleNames = [chr, "chr" + chr];
    possibleNames = _.intersection(actualNames, possibleNames);

    if (possibleNames.length > 0) {
      return _.findWhere(mergedSequences, {name: possibleNames[0]});
    }
    return null;
  };

  var jumpToPosition = function(position, chr, baseView, snp) {
    if (chr) {
      // Update our sequence
      var sequence = fuzzyFindSequence(chr);
      if (!sequence) {
        return;
      }

      selectSequence(sequence);
    }

    var currentLength = currentSequence.length;
    if (position > currentLength) {
      showError('This sequence only has ' + xFormat(currentLength) +
          ' bases. Please try a smaller position.');
      return;
    }

    positionIndicator.attr('position', baseView ? position : -1)
        .attr('snp', snp || '').attr('loaded', '');
    positionIndicator.selectAll('text')
        .text(baseView ? (snp || xFormat(position)) : '');

    var zoomLevel = baseView ? maxZoom : maxZoom / zoomLevelChange; // Read level
    if (zoom.scale() != zoomLevel) {
      zoom.scale(zoomLevel);
    }
    moveToSequencePosition(position);
    handleZoomEnd();
  };

  var addImage = function(parent, name, width, height, x, y,
      opt_handler, opt_class) {
    return parent.append('image').attr('xlink:href', '/static/img/' + name)
        .attr('width', width).attr('height', height)
        .attr('x', x).attr('y', y)
        .on("mouseup", opt_handler || function(){})
        .attr('class', opt_class || '');
  };

  var addText = function(parent, name, x, y) {
    return parent.append('text').text(name).attr('x', x).attr('y', y);
  };

  var sequenceId = function(name) {
    return 'sequence-' + name.replace(/[\|\.]/g, '');
  };

  var selectSequence = function(sequence) {
    readCache.clear();
    currentSequence = sequence;
    $('.sequence').removeClass('active');
    var div = $('#' + sequenceId(sequence.name)).addClass('active');

    // Make sure the selected sequence div is visible
    var divLeft = div.offset().left;
    var windowWidth = $(window).width();
    if (divLeft < 0 || divLeft > windowWidth - 200) {
      var currentScroll = $("#sequences").scrollLeft();
      $("#sequences").animate({scrollLeft: currentScroll + divLeft - windowWidth/2});
    }

    $('#graph').show();
    if (!setupRun) {
      setup();
    }

    // Axis and zoom
    x.domain([1, sequence['length']]);
    maxZoom = Math.ceil(Math.max(1, sequence['length'] / minRange));
    zoomLevelChange = Math.pow(maxZoom, 1/6);
    zoom.x(x).scaleExtent([1, maxZoom]).size([width, height]);

    $('#jumpDiv').show();
  };

  var makeImageUrl = function(name) {
    return '/static/img/' + name + '.png';
  };

  var getSequenceName = function(sequence) {
    return sequence.name;
  };

  var updateSequences = function() {
    var sequencesDiv = $("#sequences").empty();
    var allSequences = _.flatten(_.pluck(setObjects, 'sequences'));
    var indexedSequences = _.countBy(allSequences, getSequenceName);
    mergedSequences = _.uniq(allSequences, false, getSequenceName);

    $.each(mergedSequences, function(i, sequence) {
      var title, imageUrl;

      if (sequence.name.indexOf('X') != -1) {
        title = 'Chromosome X';
        imageUrl = makeImageUrl('chrX');
      } else if (sequence.name.indexOf('Y') != -1) {
        title = 'Chromosome Y';
        imageUrl = makeImageUrl('chrY');
      } else {
        var number = sequence.name.replace(/\D/g,'');
        if (!!number && number < 23) {
          title = 'Chromosome ' + number;
          imageUrl = makeImageUrl('chr' + number);
        } else {
          title = sequence.name;
        }
      }

      var summary = xFormat(sequence['length']) + " bases";
      var setCount = indexedSequences[sequence.name];

      var sequenceDiv = $('<div/>', {'class': 'sequence',
        id: sequenceId(sequence.name)}).appendTo(sequencesDiv);
      if (imageUrl) {
        $('<img>', {'class': 'pull-left', src: imageUrl}).appendTo(sequenceDiv);
      }
      $('<div>', {'class': 'title'}).text(title).appendTo(sequenceDiv);
      if (setObjects.length != setCount) {
        $('<div>', {'class': 'badge pull-right'}).text(setCount)
          .appendTo(sequenceDiv);
      }
      $('<div>', {'class': 'summary'}).text(summary).appendTo(sequenceDiv);

      sequenceDiv.click(function() {
        switchToLocation(sequence.name + ":" + Math.floor(sequence['length'] / 2));
      });
    });

    $('#jumpDiv').show();
  };

  // Update the UI for the current position.  Called frequently during a drag
  // or zoom operation, and so this must be very fast (<16ms for 60fps dragging).
  // This shouldn't create or manipulate any SVG/DOM objects for things not being
  // displayed (eg. offscreen letters).
  var updateDisplay = function() {
    var scaleLevel = getScaleLevel();
    var summaryView = scaleLevel < 2;
    var coverageView = scaleLevel == 2 || scaleLevel == 3;
    var readView = scaleLevel == 4 || scaleLevel == 5;
    var baseView = scaleLevel > 5;

    var sequenceStart = parseInt(x.domain()[0]);
    var sequenceEnd = parseInt(x.domain()[1]);

    var readsInView = readCache.getReads().filter(function(read) {
      return overlaps(read.position, read.end, sequenceStart, sequenceEnd);
    });
    readTrackLength = _.max(_.pluck(readsInView, 'yOrder'));
    var maxY = updateHeight();
    var reads = readGroup.selectAll(".read").data(readsInView,
      function(read) { return read.id; });
    reads.enter().append("g")
      .attr('class', 'read')
      .on("mouseover", showRead)
      .on("mouseout", deselectObject);
    reads.exit().remove();

    var variants = readGroup.selectAll(".variant");

    var readOutlines = reads.selectAll(".outline")
      .data(function(read, i) { return [read];});
    readOutlines.enter().append('polygon')
      .attr('class', 'outline');
    readOutlines.exit().remove();

    var readLetters = reads.selectAll(".letter");

    var variantOutlines = variants.selectAll(".outline");
    var variantLetters = variants.selectAll(".letter");

    // If we are trying to do base view but have no reads with bases yet, then
    // just show reads for now.
    if (baseView && readsInView.length
        && readsInView.every(function (r) { return r.readPieces.length == 0; })) {
      baseView = false;
      readView = true;
    }

    toggleVisibility(unsupportedMessage, summaryView || coverageView);
    toggleVisibility(readOutlines, readView);
    toggleVisibility(variantOutlines, readView);
    toggleVisibility(readLetters, baseView);
    toggleVisibility(variantLetters, baseView);
    toggleVisibility(positionIndicator, baseView);
    // TODO: Bring back coverage and summary views

    if (readView) {
      readOutlines.attr("points", readOutlinePoints);
      variantOutlines
        .attr("x1", function(data) { return x(data.rx) + textWidth; })
        .attr("x2", function(data) { return x(data.rx) + textWidth; })
        .attr("y1", function(data) { return y(maxY - data.ry); })
        .attr("y2", function(data) { return y(maxY - data.ry) + textHeight; });
      readLetters.remove();

    } else if (baseView) {
      var filterLetters = function(read) {
        return read.readPieces.filter(function(letter) {
          return letter.rx >= sequenceStart && letter.rx < sequenceEnd;
        });
      };
      readLetters = readLetters.data(filterLetters, function(letter, i) {
        // Although the docs don't say so explicitly, it appears that the
        // key only needs to be unique within the group (read) as opposed to
        // across all groups.
        return letter.rx;
      });

      readLetters.enter().append('text')
        .attr('class', 'letter')
        .style('opacity', function(data, i) { return opacity(data.qual); })
        .text(function(data, i) { return data.letter; });
      readLetters.exit().remove();

      readLetters.attr("x", function(data, i) {
            return x(data.rx) + textWidth;
          })
          .attr("y", function(data, i) {
            return y(this.parentNode.__data__.yOrder) + textHeight/2;
          });

      // Red position highlight box
      var position = positionIndicator.attr('position');
      var indicatorX = x(position) + textWidth/2 - 2;
      positionIndicator.attr('transform', 'translate(' + indicatorX + ',0)');

      // Read base stats
      var snp = positionIndicator.attr('snp');
      var loaded = positionIndicator.attr('loaded');
      var readStats = getReadStats(position);
      if (!loaded && snp && readStats) {
        positionIndicator.attr('loaded', true);
        var alleles = getAlleles(snp, readStats);
        $.getJSON('api/alleles', alleles).done(function(res) {
          if (res.summary) {
            var text = positionIndicator.selectAll('text').text(res.name + " ");
            text.append('a').attr('xlink:href', res.link)
                .attr('target', '_blank')
                .text(res.repute + ' - ' + res.summary);
          }
        });
      }

      // Variants
      variantLetters.attr("x", function(data, i) {
            return x(data.rx) + textWidth;
          })
          .attr("y", function(data, i) {
            return y(maxY - data.ry) + textHeight/2;
          });
    }
  };

  var getAlleles = function(snp, counts) {
    // First strip out low values
    var totalCount = _.reduce(counts, function(memo, key) {
      return memo + key;
    }, 0);
    var minCount = totalCount * .2;
    var bases = _.compact(_.map(counts, function(key, value) {
      return key > minCount ? value : '';
    }));

    var a1 = bases[0];
    var a2 = bases.length == 1 ? a1 : bases[1];
    return {'snp': snp, 'a1': a1, 'a2': a2};
  };

  var toggleVisibility = function(items, visible) {
    items.style('display', visible ? 'block' : 'none');
  };

  // Read position
  var stringifyPoints = function(points) {
    for (var i = 0; i < points.length; i++) {
      points[i] = points[i].join(',');
    }
    return points.join(' ');
  };

  var readOutlinePoints = function(read, i) {
    var yTracksLength = y.domain()[0];
    var barHeight = Math.min(30, Math.max(2,
        (height - margin * 3) / yTracksLength - 5));

    var pointWidth = 10;
    var startX = Math.max(margin, x(read.position));
    var endX = Math.min(width - margin, x(read.end));

    if (startX > endX - pointWidth) {
      return '0,0';
    }

    var startY = y(this.parentNode.__data__.yOrder);
    var endY = startY + barHeight;
    var midY = (startY + barHeight / 2);


    if (read.reverse) {
      startX += pointWidth;
    } else {
      endX -= pointWidth;
    }

    var points = [];
    points.push([startX, startY]);
    if (read.reverse) {
      points.push([startX - pointWidth, midY]);
    }
    points.push([startX, endY]);
    points.push([endX, endY]);
    if (!read.reverse) {
      points.push([endX + pointWidth, midY]);
    }
    points.push([endX, startY]);
    return stringifyPoints(points);
  };

  // Hover details
  var showObject = function(item, div, title, fields) {
    div.empty().show();
    closeButton().appendTo(div).click(function() {
      div.hide();
    });

    $("<h4/>").text(title).appendTo(div);
    var dl = $("<dl/>").addClass("dl-horizontal").appendTo(div);

    $.each(fields, function(i, field) {
      addField(dl, field[0], field[1]);
    });

    d3.select(item).classed("selected", true);
  };

  var addField = function(dl, title, field) {
    if (field) {
      $("<dt/>").text(title).appendTo(dl);
      $("<dd/>").text(field).appendTo(dl);
    }
  };

  var showRead = function(read) {
    showObject(this, readDiv, "Read: " + read.name, [
      ["Position", read.position],
      ["Length", read.length],
      ["Mate position", read.nextMatePosition ? read.nextMatePosition.position : ''],
      ["Mapping quality", read.alignment.mappingQuality],
      ["Cigar", getCigarString(read.alignment.cigar)]
    ]);
  };

  var getCigarString = function(cigar) {
    return _.reduce(cigar, function(str, c) {
      return str + " " + c.operationLength + " " + c.operation;
    }, "");
  };

  var showVariant = function(data) {
    var variant = data.variant;
    var call = variant.calls[data.callIndex];

    var name = variant.names ? variant.names.join(" ") : "";

    showObject(this, variantDiv, "Variant: " + name, [
      ["Call set name", call.callSetName],
      ["Genotype", getGenotype(variant, call)],
      ["Reference name", variant.referenceName],
      ["Reference bases", variant.referenceBases],
      ["Start", variant.start],
      ["End", variant.end]
    ]);
  };

  var deselectObject = function(read, i) {
    d3.select(this).classed("selected", false);
  };


  // D3 object creation

  var getGenotype = function(variant, call) {
    var genotype = [];
    for (var g = 0; g < call.genotype.length; g++) {
      var allele = call.genotype[g];
      if (allele == 0) {
        genotype.push(variant.referenceBases);
      } else if (allele > 0) {
        genotype.push(variant.alternateBases[allele - 1]);
      }
    }

    return genotype;
  };

  var setVariants = function(variants) {
    var data = [];
    var maxCalls = 0;

    $.each(variants, function(i, variant) {
      maxCalls = Math.max(variant.calls.length, maxCalls);

      $.each(variant.calls, function(callIndex, call) {
        data.push({
          id: variant.id + call.callSetId,
          rx: variant.start,
          ry: callIndex,
          genotype: getGenotype(variant, call).join(";"),
          variant: variant,
          callIndex: callIndex
          // TODO: Use likelihood for opacity
        });
      });

    });

    var variantDivs = readGroup.selectAll(".variant").data(data,
        function(data){ return data.id; });

    variantDivs.enter().append("g")
        .attr('class', 'variant')
        .on("mouseover", showVariant)
        .on("mouseout", deselectObject);

    var outlines = variantDivs.selectAll('.outline')
        .data(function(variant, i) { return [variant];});
    outlines.enter().append('line').attr('class', 'outline');

    var baseView = getScaleLevel() > 5;
    if (baseView) {
      var bases = variantDivs.selectAll(".letter")
          .data(function(variant, i) { return [variant];});

      bases.enter().append('text')
          .attr('class', 'letter')
          .text(function(data, i) { return data.genotype; });
    }

    variantDivs.exit().remove();

    callsetTrackLength = maxCalls;
    updateDisplay();
  };

  var updateReads = function(reads) {
    var newReadIds = {};

    $.each(reads, function(readi, read) {
      read.position = parseInt(read.alignment.position.position);

      read.id = read.id || (read.fragmentName + read.position + read.readNumber);

      if (newReadIds[read.id]) {
        showError('There is more than one read with the ID ' + read.id +
            ' - extras ignored');
        return;
      }
      newReadIds[read.id] = true;

      // Skip this read if we already have exactly it.
      if (readCache.hasRead(read)) {
        return;
      }

      // Interpret the cigar
      // TODO: Compare the read against a reference as well
      read.name = read.fragmentName || read.id;
      read.readPieces = [];

      if (!read.alignment.cigar) {
        // Hack for unmapped reads
        read.length = 0;
        read.end = read.position;
        return;
      }

      var addLetter = function(type, letter, qual) {
        var basePosition = read.position + read.readPieces.length;
        read.readPieces.push({
          'letter' : letter,
          'rx': basePosition,
          'qual': qual,
          'cigarType': type
        });
      };

      var bases = null;
      if (read.alignedSequence) {
        bases = read.alignedSequence.split('');
      }
      var baseIndex = 0;
      read.length = 0;

      for (var m = 0; m < read.alignment.cigar.length; m++) {
        var match = read.alignment.cigar[m];
        var baseCount = parseInt(match.operationLength);
        var baseType = match.operation;

        switch (baseType) {
          case 'CLIP_HARD':
          case 'PAD':
            // We don't display clipped sequences right now
            break;
          case 'DELETE':
          case 'SKIP':
            // Deletions get placeholders inserted
            for (var b = 0; b < baseCount; b++) {
              if (bases) {
                addLetter(baseType, '-', 100);
              }
              read.length++;
            }
            break;
          case 'CLIP_SOFT': // TODO: Reveal this skipped data somewhere
            baseIndex += baseCount;
            break;
          case 'INSERT':
            // Insertions are skipped
            // TODO: Indicate the missing bases in the UI
            baseIndex += baseCount;
            break;
          case 'SEQUENCE_MISMATCH': // TODO: Color these differently
          case 'SEQUENCE_MATCH':
          case 'ALIGNMENT_MATCH':
            // Matches and insertions get displayed
            for (var j = 0; j < baseCount; j++) {
              if (bases) {
                addLetter(baseType, bases[baseIndex],
                  read.alignedQuality[baseIndex]);
              }
              baseIndex++;
              read.length++;
            }
            break;
        }
      }

      // Remove data that's now redundant with readPieces.
      if (bases) {
        delete read.alignedSequence;
        delete read.alignedQuality;
      }

      read.end = read.position + read.length;
      read.reverse = read.alignment.position.reverseStrand;

      // Create or update the entry in the cache, assuming we still want it.
      // Note that we can't easily test to see if we still want the read before
      // doing the work above because we need to compute read.end.
      readCache.addOrUpdateRead(read);
    });

    updateDisplay();
  };

  // Data loading

  var makeQueryParams = function(sequenceStart, sequenceEnd, type, opt_bases) {
    var sets = _.where(setObjects, {type: type});
    if (sets.length == 0) {
      return null;
    }

    var setIds = _.pluck(sets, 'id');
    var setBackends = _.uniq(_.pluck(sets, 'backend'));
    if (setBackends.length > 1) {
      showError("Currently all sets of the same type " +
        "must be from the same backend");
      return null;
    }

    var queryParams = {};
    queryParams.setIds = setIds.join(',');
    queryParams.backend = setBackends[0];
    queryParams.sequenceName = currentSequence.name;
    queryParams.sequenceStart = parseInt(sequenceStart);
    queryParams.sequenceEnd = parseInt(sequenceEnd);

    if (type == READSET_TYPE) {
      var baseFields = opt_bases ? ',alignedSequence,alignedQuality' : '';
      // TODO: Google Read ID is rather long (increases transfer volume by ~50%
      // in read view).  Should we synthesize our own instead?
      queryParams.readFields = 'id,fragmentName,alignment,nextMatePosition' + baseFields;
    }

    return queryParams;
  };

  var MIN_CACHE_FACTOR = 0.5;
  var MAX_CACHE_FACTOR = 1;

  var ensureReadsCached = function(start, end, bases) {

    // Cache additional data than just what's requested so that we can do
    // some small navigations quickly and without incurring redudant transfers.
    // Smaller values of the cache factor result in more redundant read
    // operations, larger values use more memory and reduce the likelihood of
    // temporarily seeing missing reads.
    var addingBases = bases && !readCache.wantBases;
    var windowSize = end - start;
    if (start - windowSize * MIN_CACHE_FACTOR >= readCache.start
        && end + windowSize * MIN_CACHE_FACTOR <= readCache.end
        && !addingBases) {
      return;
    }

    var desiredStart = start - windowSize * MAX_CACHE_FACTOR;
    desiredStart = clamp(desiredStart, 1, currentSequence.length);
    var desiredEnd = end + windowSize * MAX_CACHE_FACTOR;
    desiredEnd = clamp(desiredEnd, 1, currentSequence.length);

    if (overlaps(desiredStart, desiredEnd, readCache.start, readCache.end)
        && !addingBases) {
      // Don't re-request the reads we already have.  This will still retransfer
      // reads which overlap the boundaries, but that should be small in practice.
      if (desiredStart < readCache.start) {
        queryReadData(desiredStart, readCache.start, bases);
      }
      if (desiredEnd > readCache.end) {
        queryReadData(readCache.end, desiredEnd, bases);
      }
    } else {
      queryReadData(desiredStart, desiredEnd, bases);
    }

    // TODO: Update variants to use the same caching mechanism as reads
    queryVariantData(desiredStart, desiredEnd);
    readCache.setRange(desiredStart, desiredEnd, bases);
  };

  var queryReadData = function(start, end, bases) {
    var readParams = makeQueryParams(start, end, READSET_TYPE, bases);
    if (readParams) {
      callXhr('/api/reads', readParams, updateReads);
    }
  };

  var queryVariantData = function(start, end) {
    var variantParams = makeQueryParams(start, end, CALLSET_TYPE);
    if (variantParams) {
      callXhr('/api/variants', variantParams, setVariants);
    }
  };


  var pendingLoads = 0;
  var totalLoads = 0;
  var startLoadMonitor = function() {
    if (!pendingLoads) {
      spinner.style('display', 'block');
    }
    pendingLoads++;
    var loadIndex = totalLoads++;
    var timeLabel = 'readgraph load[' + loadIndex + ']';
    if ('time' in console) {
      console.time(timeLabel);
    }
    if ('timeStamp' in console) {
      console.timeStamp(timeLabel + ' start');
    }

    // Callers should invoke this callback on completion
    return function() {
      pendingLoads--;
      if (!pendingLoads) {
        spinner.style('display', 'none');
      }
      if ('time' in console) {
        console.timeEnd(timeLabel);
      }
      if ('timeStamp' in console) {
        console.timeStamp(timeLabel + ' finish');
      }
    };
  };

  var totalReadBytes = 0;
  var callXhr = function(url, queryParams, handler, opt_monitor, opt_data) {
    var onComplete = opt_monitor || startLoadMonitor();
    $.getJSON(url, queryParams)
        .done(function(res, status, jqXHR) {
          var data;
          if (res.alignments) {
            var len = parseInt(jqXHR.getResponseHeader('Content-Length'));
            totalReadBytes += len;
            console.log('readgraph ' + res.alignments.length
              + (res.alignments.length && 'alignedSequence' in res.alignments[0] ? ' full' : ' partial')
              + ' reads (' + Math.round(len/1024) + 'kb), total ' + Math.round(totalReadBytes/1024) + 'kb');
            // Reads are handled incrementally, but variants aren't yet.
            // Eventually variants will be updated to follow the same pattern.
            handler(res.alignments);
          } else {
            data = (opt_data || []).concat(res.variants || []);
            handler(data);
          }

          if (res.nextPageToken) {
            queryParams['pageToken'] = res.nextPageToken;
            callXhr(url, queryParams, handler, onComplete, data);
          } else {
            onComplete();
          }
        })
        .fail(function() {
          onComplete();
        });
  };

  this.updateSets = function(setData) {
    if (_.isEqual(setObjects, setData)) {
      return;
    }

    setObjects = setData;
    updateSequences();

    if (setObjects.length == 0) {
      $('#chooseSetMessage').show();
      $('#graph').hide();
      $('#jumpDiv').hide();
      $('.infoDiv').hide();

    } else {
      $('#chooseSetMessage').hide();
    }
  };
};
