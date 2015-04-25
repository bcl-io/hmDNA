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

/*
 * Return whether two ranges overlap at all.
 */
function overlaps(start1, end1, start2, end2) {
  return start1 < end2 && end1 > start2;
};

/*
 * A data structure for keeping track of all the reads we have loaded.
 * The objects in the cache have already been processed, and so must have
 * their computed fields like end and readPieces (rather than the raw fields
 * like alignedSequence).
 */
var readCache = new function() {
  /*
   * Whether we're caching base data.  All reads stored into the cache
   * should have the 'alignedSequence' property if and only if this is true.
   * When this changes from true to false, all cached base data is cleared.
   * But when this changes from false to true, reads without base data are
   * preserved until they can be updated to include the base data.
   */
  var wantBases = false;
  this.__defineGetter__("wantBases", function() { return wantBases; });

  /*
   * The range [start,end) of sequence positions for which we are caching reads.
   * There should never be any reads inside the cache that lie entirely outside
   * this range.
   */
  var start = 0;
  var end = 0;
  this.__defineGetter__("start", function() { return start; });
  this.__defineGetter__("end", function() { return end; });

  // A map from read ID to read object.
  var readsById = {};

  // An array of RBTrees, one per track, containing all the reads assigned to
  // that track by position.
  var yTracks = [];

  /*
   * Returns all the reads in the cache.
   */
  this.getReads = function() {
    return d3.values(readsById);
  };

  /*
   * Clear the entire cache.
   */
  this.clear = function() {
    wantBases = false;
    start = 0;
    end = 0;
    readsById = {};
    yTracks = [];
  };

  // Remove a specific read from the cache.
  function removeRead(read) {
    var removed = yTracks[read.yOrder].remove(read);
    assert(removed);
    assert(readsById[read.id] === read);
    delete readsById[read.id];
  };

  /*
   * Reset the cache range, clearing elements / base data that are no longer
   * necessary.
   */
  this.setRange = function(newStart, newEnd, newBases) {
    // Find all reads outside the new range and remove them.
    // Ideally our RBTree implementation would just support
    // efficiently removing ranges of nodes, or removing given an iterator.
    for (var y = 0; y < yTracks.length; y++) {
      var tree = yTracks[y];

      // Remove nodes from the front as long as they're outside our range.
      for(var read = tree.min(); read && read.end < newStart; read = tree.min()) {
        assert(read.yOrder == y);
        removeRead(read);
      }

      // Remove nodes from the end as long as they're outside our range.
      for(var read = tree.max(); read && read.position >= newEnd; read = tree.max()) {
        assert(read.yOrder == y);
        removeRead(read);
      }
    }

    // Discard stored bases if we don't want them anymore.
    if (wantBases && !newBases) {
      $.each(readsById, function(id, read) {
        read.readPieces = [];
      });
    }

    // Discard any cached reads that are now entirely outside our desired window.
    $.each(readsById, function(id, read) {
      if (!overlaps(read.position, read.end, newStart, newEnd)) {
        delete readsById[id];
      } else if (!newBases) {
        read.readPieces = [];
      }
    });

    start = newStart;
    end = newEnd;
    wantBases = newBases;
  };

  /*
   * Return whether the cache already contains a read with the specified
   * id and base status.
   */
  this.hasRead = function(id, bases) {
    var existingRead = readsById[id];
    if (existingRead && bases == ('readPieces' in existingRead)) {
      return true;
    }
    return false;
  };

  // Comparer function for the RBTrees
  function readOverlapComparer(r1, r2) {
    if (overlaps(r1.position, r1.end, r2.position, r2.end)) {
      return 0;  // reads that overlap are considered "equal"
    }
    // Since we know that no two reads in the tree overlap, we can sort
    // just by the start position.
    return r1.position - r2.position;
  }

  /*
   * Adds the supplied read to the cache if it's still relevant, assigning a
   * free yOrder property to thr read.
   * If a read with this ID already exists, updates the read (eg. to add
   * or remove base data) without changing the yOrder.
   */
  this.addOrUpdateRead = function(read) {
    // The read should have already been processed.
    assert('end' in read);
    assert('readPieces' in read);
    assert(!('alignedSequence' in read));

    // If we don't actually want this read anymore, do nothing.
    if (!overlaps(read.position, read.end, start, end)
            || (read.readPieces.length > 0) != wantBases) {
      return;
    }

    var existingRead = readsById[read.id];
    if (existingRead) {
      read.yOrder = existingRead.yOrder;
      var removed = yTracks[read.yOrder].remove(existingRead);
      assert(removed);
      var inserted = yTracks[read.yOrder].insert(read);
      assert(inserted);
    } else {
      // Find the lowest available track for this read.
      assert(!('yOrder' in read));
      for(read.yOrder = 0;; read.yOrder++) {
        if (read.yOrder < yTracks.length) {
          if (yTracks[read.yOrder].insert(read)) {
            // Successfully inserted into this track.
            break;
          }
        } else {
          // Need a new track.
          var newTree = new RBTree(readOverlapComparer);
          yTracks[read.yOrder] = newTree;
          var inserted = newTree.insert(read);
          assert(inserted);
          break;
        }
      }
    }
    readsById[read.id] = read;
  };
};

