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
package com.google.cloud.genomics.gatk.htsjdk;

import com.google.cloud.genomics.gatk.common.GenomicsApiDataSource;
import com.google.cloud.genomics.gatk.common.ReadIteratorResource;
import com.google.common.base.Stopwatch;

import htsjdk.samtools.SAMFileHeader;
import htsjdk.samtools.SAMFileHeader.SortOrder;
import htsjdk.samtools.SAMRecord;
import htsjdk.samtools.SAMRecordIterator;

import java.util.concurrent.TimeUnit;
import java.util.Iterator;
import java.util.logging.Logger;

/**
 * Wraps iterators provided from Genomics API and implements
 * HTSJDK's SAMRecordIterator.
 * Iterates over data returned from the API and when needed
 * re-queries the API for more data.
 * Since the API always return *overlapping* reads and SAMRecordIterator
 * supports contained and start-at queries, this class filters reads
 * returned from the API to make sure they conform to the requested intervals.
 */
public class GA4GHSamRecordIterator implements SAMRecordIterator{
  private static final Logger LOG = Logger.getLogger(GA4GHSamRecordIterator.class.getName());

  private static final long STATS_DUMP_INTERVAL_READS = 100000;
  
  Iterator<SAMRecord> iterator;
  GenomicsApiDataSource dataSource;
  GA4GHQueryInterval[] intervals;
  String readSetId;
  int intervalIndex = -1;
  boolean hasNext;
  SAMRecord nextRead;
  SAMFileHeader header;
  long processedReads;
  Stopwatch timer;
  
  public GA4GHSamRecordIterator(GenomicsApiDataSource dataSource,
      String readSetId,
      GA4GHQueryInterval[] intervals) {
    this.dataSource = dataSource;
    this.readSetId = readSetId;
    this.intervals = intervals;
    this.timer = Stopwatch.createUnstarted();
    seekMatchingRead();
  }
  
  /** Returns true when we truly reached the end of all requested data */
  boolean isAtEnd() {
    return intervals == null || intervals.length == 0 ||  
        intervalIndex >= intervals.length;
  }
  
  /** Returns the current interval being processed or null if we have reached the end */
  GA4GHQueryInterval currentInterval() {
    if (isAtEnd()) {
      return null;
    }
    return intervals[intervalIndex];
  }
  
  /** Re-queries the API for the next interval */
  ReadIteratorResource queryNextInterval() {
    Stopwatch w = Stopwatch.createStarted();
    if (!isAtEnd()) {
      intervalIndex++;
    }
    if (isAtEnd()) {
      return null;
    }
    ReadIteratorResource result =  queryForInterval(currentInterval());
    LOG.info("Interval query took: " + w);
    startTiming();
    return result;
  }
  
  /** Queries the API for an interval and returns the iterator resource, or null if failed */
  ReadIteratorResource queryForInterval(GA4GHQueryInterval interval) {
    try {
      return dataSource.getReadsFromGenomicsApi(readSetId, interval.getSequence(),
          interval.getStart(), interval.getEnd());
    } catch (Exception ex) {
      LOG.warning("Error getting data for interval " + ex.toString());
    }
    return null;
  }
  
  /**
   * Ensures next returned read will match the currently requested interval.
   * Since the API always returns overlapping reads we might need to skip some
   * reads if the interval asks for "included" or "starts at" types.
   * Also deals with the case of iterator being at an end and needing to query
   * for the next interval.
   */
  void seekMatchingRead()  {
    while (!isAtEnd()) {
      if (iterator == null || !iterator.hasNext()) {
        LOG.info("Getting " + 
            (iterator == null ? "first" : "next") + 
            "interval from the API");
        // We have hit an end (or this is first time) so we need to go fish
        // to the API.
        ReadIteratorResource resource = queryNextInterval();
        if (resource != null) {
          LOG.info("Got next interval from the API");
          header = resource.getSAMFileHeader();
          iterator = resource.getSAMRecordIterable().iterator();
        } else {
          LOG.info("Failed to get next interval from the API");
          header = null;
          iterator = null;
        }
      } else {
        nextRead = iterator.next();
        if (currentInterval().matches(nextRead)) {
          return; // Happy case, otherwise we keep spinning in the loop.
        } else {
          LOG.info("Skipping non matching read");
        }
      }
    }
  }
 
  
  @Override
  public void close() {
    this.iterator = null;
    this.dataSource = null;
    this.intervalIndex = intervals.length;
  }

  @Override
  public boolean hasNext() {
    return !isAtEnd();
  }

  @Override
  public SAMRecord next() {
    SAMRecord retVal = nextRead;
    seekMatchingRead();
    updateTiming();
    return retVal;
  }

  @Override
  public void remove() {
    // Not implemented
  }

  @Override
  public SAMRecordIterator assertSorted(SortOrder sortOrder) {
    // TODO(iliat): implement this properly. This code never checks anything.
    return this;
  }
  
  public SAMFileHeader getFileHeader() {
    return header;
  }
  
  void startTiming() {
    processedReads = 0;
    timer.start(); 
  }
  
  void updateTiming() {
    processedReads++;
    if ((processedReads % STATS_DUMP_INTERVAL_READS) == 0) {
      dumpTiming();
    }
  }
  
  void stopTiming() {
    timer.stop();
  }
  
  void dumpTiming() {
    if (processedReads == 0) {
      return;
    }
    LOG.info("Processed " + processedReads + " reads in " + timer + 
        ". Speed: " + (processedReads*1000)/timer.elapsed(TimeUnit.MILLISECONDS) + " reads/sec");
    
  }
}
