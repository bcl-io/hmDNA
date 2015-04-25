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

import com.google.cloud.genomics.gatk.common.GA4GHUrl;
import com.google.cloud.genomics.gatk.common.GenomicsApiDataSource;
import com.google.cloud.genomics.gatk.common.GenomicsApiDataSourceFactory;
import com.google.cloud.genomics.gatk.common.GenomicsApiDataSourceFactory.Settings;

import htsjdk.samtools.QueryInterval;
import htsjdk.samtools.SAMFileHeader;
import htsjdk.samtools.SAMFormatException;
import htsjdk.samtools.SAMRecord;
import htsjdk.samtools.SAMRecordIterator;
import htsjdk.samtools.SamReader;
import htsjdk.samtools.util.CloseableIterator;

import java.io.IOException;
import java.net.URISyntaxException;
import java.net.URL;
import java.security.GeneralSecurityException;

/**
 * SamReader implementation that reads data from GA4GH API.
 * For client_secrets file, specify the path in the ga4gh.client_secrets system property.
 */
public class GA4GHSamReader implements SamReader {
  private GA4GHUrl url;
  private GenomicsApiDataSourceFactory factory;
  GenomicsApiDataSource dataSource;
  GA4GHSamRecordIterator iterator;
  
  public GA4GHSamReader(URL url) throws URISyntaxException, IOException, GeneralSecurityException {
    this.url = new GA4GHUrl(url);
    this.factory = new GenomicsApiDataSourceFactory();
    factory.configure(this.url.getRootUrl(), 
        new Settings(
            System.getProperty("ga4gh.client_secrets", "client_secrets.json"),
            System.getProperty("ga4gh.no_local_server","")
              .toLowerCase().equals("true")));
    dataSource = factory.get(this.url.getRootUrl());
    queryOverlapping(this.url.getSequence(), this.url.getRangeStart(), 
        this.url.getRangeEnd());
  }
  
  @Override
  public void close() throws IOException {
    this.dataSource = null;
    this.factory = null;
  }

  @Override
  public SAMFileHeader getFileHeader() {
    return iterator.getFileHeader();
  }

  @Override
  public Type type() {
    // TODO(iliat): figure out bearing of this on indexing
    return Type.SAM_TYPE;
  }

  @Override
  public boolean hasIndex() {
    return true;
  }

  @Override
  public Indexing indexing() {
    return null;
  }
  
  @Override
  public SAMRecordIterator queryContained(String sequence, int start, int end) {
    return query(sequence, start, end, true);
  }
  
  @Override
  public SAMRecordIterator queryOverlapping(String sequence, int start, int end) {
    return query(sequence, start, end, false);
  }
  
  @Override
  public SAMRecordIterator queryContained(QueryInterval[] intervals) {
    return query(intervals, true);
  }
  
  @Override
  public SAMRecordIterator queryOverlapping(QueryInterval[] intervals) {
    return query(intervals, false);
  }

  @Override
  public SAMRecordIterator queryUnmapped() {
    return queryOverlapping("*", 0, 0);
  }
  
  @Override
  public SAMRecordIterator query(QueryInterval[] intervals, boolean contained) {
    final GA4GHQueryInterval[] myIntervals = new GA4GHQueryInterval[intervals.length];
    final GA4GHQueryInterval.ReadPositionConstraint constraint = contained ?
      GA4GHQueryInterval.ReadPositionConstraint.CONTAINED : 
      GA4GHQueryInterval.ReadPositionConstraint.OVERLAPPING;
    final SAMFileHeader header = getFileHeader();
    for (int i = 0; i < intervals.length; i++) {
      final QueryInterval interval = intervals[i];
      final String sequence = header.getSequence(
          interval.referenceIndex).getSequenceName();
      myIntervals[i] = new GA4GHQueryInterval(sequence, interval.start, 
          interval.end, constraint);
    }
    return query(myIntervals);
  }
  
  @Override
  public SAMRecordIterator query(String sequence, int start, int end, boolean contained) {
    return query(new GA4GHQueryInterval[] {
        new GA4GHQueryInterval(sequence, start, end, contained ? 
            GA4GHQueryInterval.ReadPositionConstraint.CONTAINED : 
            GA4GHQueryInterval.ReadPositionConstraint.OVERLAPPING)});
  }

  @Override
  public SAMRecordIterator queryAlignmentStart(String sequence, int start) {
    return query(new GA4GHQueryInterval[] {
          new GA4GHQueryInterval(sequence, start, 0, 
              GA4GHQueryInterval.ReadPositionConstraint.START_AT)});
  }

  @Override
  public SAMRecord queryMate(SAMRecord rec) {
    if (!rec.getReadPairedFlag()) {
      throw new IllegalArgumentException("queryMate called for unpaired read.");
    }
    if (rec.getFirstOfPairFlag() == rec.getSecondOfPairFlag()) {
        throw new IllegalArgumentException(
            "SAMRecord must be either first and second of pair, but not both.");
    }
    final boolean firstOfPair = rec.getFirstOfPairFlag();
    final CloseableIterator<SAMRecord> it;
    if (rec.getMateReferenceIndex() == SAMRecord.NO_ALIGNMENT_REFERENCE_INDEX) {
        it = queryUnmapped();
    } else {
        it = queryAlignmentStart(rec.getMateReferenceName(), rec.getMateAlignmentStart());
    }
    try {
        SAMRecord mateRec = null;
        while (it.hasNext()) {
            final SAMRecord next = it.next();
            if (!next.getReadPairedFlag()) {
                if (rec.getReadName().equals(next.getReadName())) {
                    throw new SAMFormatException(
                        "Paired and unpaired reads with same name: " + rec.getReadName());
                }
                continue;
            }
            if (firstOfPair) {
                if (next.getFirstOfPairFlag()) {
                  continue;
                }
            } else {
                if (next.getSecondOfPairFlag()) {
                  continue;
                }
            }
            if (rec.getReadName().equals(next.getReadName())) {
                if (mateRec != null) {
                    throw new SAMFormatException(
                        "Multiple SAMRecord with read name " + rec.getReadName() +
                            " for " + (firstOfPair ? "second" : "first") + " end.");
                }
                mateRec = next;
            }
        }
        return mateRec;
    } finally {
        it.close();
    }
  }
  
  public SAMRecordIterator query(GA4GHQueryInterval[] intervals) {
    iterator = new GA4GHSamRecordIterator(dataSource, url.getReadset(), 
        intervals);
    return iterator();
  }
  
  @Override
  public SAMRecordIterator iterator() {
    return iterator;
  }

  @Override
  public String getResourceDescription() {
    return "GA4GH API";
  }
}
