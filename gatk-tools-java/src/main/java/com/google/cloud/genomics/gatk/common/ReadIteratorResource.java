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
package com.google.cloud.genomics.gatk.common;

import com.google.api.services.genomics.model.Read;
import com.google.api.services.genomics.model.ReadGroupSet;
import com.google.api.services.genomics.model.Reference;

import htsjdk.samtools.SAMRecordCoordinateComparator;
import htsjdk.samtools.SAMFileHeader;
import htsjdk.samtools.SAMRecord;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Iterator;
import java.util.List;
import java.util.logging.Logger;

/**
 * Provides reads data in the from of SAMRecords and SAMFileHeader, by wrapping
 * an existing source of Read and HeaderSection data and doing the conversion using
 * GenomicsConverter.
 */
public class ReadIteratorResource {
  private static final Logger LOG = Logger.getLogger(ReadIteratorResource.class.getName());
  
  private ReadGroupSet readGroupSet;
  private SAMFileHeader cachedSAMFileHeader;
  private List<Reference> references;
  private Iterable<Read> iterable;
  private UnmappedReads unmappedReads;
  private Iterator<Read> unmappedMatesIterator;
  private Iterator<SAMRecord> samePositionIterator;
  private SAMRecord recordAtNextPosition;
  private static Comparator<SAMRecord> samRecordCoordinateComparator = new SAMRecordCoordinateComparator();
  
  public ReadIteratorResource(ReadGroupSet readGroupSet, List<Reference> references,
      UnmappedReads unmappedReads, 
      Iterable<Read> iterable) {
    super();
    this.readGroupSet = readGroupSet;
    this.references = references;
    this.unmappedReads = unmappedReads;
    this.iterable = iterable;
  }

  public ReadGroupSet getReadGroupSet() {
    return readGroupSet;
  }
  
  public void setReadGroupSet(ReadGroupSet readGroupSet) {
    this.readGroupSet = readGroupSet;
  }
  
  public List<Reference> getReferences() {
    return references;
  }

  public void setReferences(List<Reference> references) {
    this.references = references;
  }
  
  public Iterable<Read> getIterable() {
    return iterable;
  }
  
  public void setIterable(Iterable<Read> iterable) {
    this.iterable = iterable;
  }
  
  public SAMFileHeader getSAMFileHeader() {
    if (cachedSAMFileHeader == null) {
      cachedSAMFileHeader = 
          GenomicsConverter.makeSAMFileHeader(getReadGroupSet(), getReferences());
    }
    return cachedSAMFileHeader;
  }
  
  public Iterable<SAMRecord> getSAMRecordIterable() {
    final Iterator<Read> readIterator = getIterable().iterator();
    final SAMFileHeader header = getSAMFileHeader();
    return new Iterable<SAMRecord>() {
      @Override
      public Iterator<SAMRecord> iterator() {
        return new Iterator<SAMRecord>() {
          private SAMRecord nextRecord = peek();
          private Read mappedRead;
          private final boolean injectingUnmappedPairsOfMappedRead = 
              unmappedReads != null;
          
          @Override
          public boolean hasNext() {
            return nextRecord != null;
          }

          @Override
          public SAMRecord next() {
            SAMRecord toReturn = nextRecord;
            nextRecord = peek();
            return toReturn;
          }

          private SAMRecord peek() {
            if (!injectingUnmappedPairsOfMappedRead) {
              return getNextSAMRecord();
            }
            // If we are traversing the list of reads at same position we
            // have collected and sorted beforehand, return elements from the list until
            // we exhaust it.
            if (samePositionIterator != null && samePositionIterator.hasNext()) {
              return samePositionIterator.next();
            }
            if (recordAtNextPosition == null) {
              recordAtNextPosition = getNextSAMRecord();
              if (recordAtNextPosition == null) {
                return null;
              }
            }
            
            // Fetch more records and if they are all on the same position,
            // collect them and sort them in HTSJDK coordinate order
            // to satisfy expectations of Picard tools.
            ArrayList<SAMRecord> readsAtSamePosition = null;
            SAMRecord currentRecord;
            while (true) {
              currentRecord = recordAtNextPosition;
              recordAtNextPosition = getNextSAMRecord();
              if (recordAtNextPosition != null && 
                  recordAtNextPosition.getAlignmentStart() == currentRecord.getAlignmentStart() &&
                      recordAtNextPosition.getReferenceName() != null &&
                      recordAtNextPosition.getReferenceName().equals(currentRecord.getReferenceName())) {
                if (readsAtSamePosition == null) {
                  readsAtSamePosition = new ArrayList<SAMRecord>(2);
                  readsAtSamePosition.add(currentRecord);
                }
                readsAtSamePosition.add(recordAtNextPosition);
              } else {
                break;
              }
            }
            if (readsAtSamePosition == null) {
              return currentRecord;
            }
            if (readsAtSamePosition.size() >= 2) {
              Collections.sort(readsAtSamePosition, samRecordCoordinateComparator);
            }
            samePositionIterator =  readsAtSamePosition.iterator();
            return samePositionIterator.next();
          }
            
          /**
           * Fetches the next SAMRecord, dealing with Read->SAMRecord
           * conversion and fixup of unmapped pairs of mapped reads.
           */
          private SAMRecord getNextSAMRecord() {
            Read nextRead = getNextRead();
            
            if (nextRead == null) {
              return null;
            }
            
            SAMRecord record = GenomicsConverter.makeSAMRecord(nextRead, 
                header);
            
            // See https://github.com/ga4gh/schemas/issues/224
            // We fix up both the mapped read of unmapped mate pair and the mate 
            // pair itself according to SAM best practices:
            // "For a unmapped paired-end or mate-pair read whose mate is mapped, 
            // the unmapped read should have RNAME and POS identical to its mate."
            if (unmappedMatesIterator != null && mappedRead != null) {
              if (mappedRead != nextRead) {
                record.setReferenceName(mappedRead.getAlignment().getPosition().getReferenceName());
                record.setAlignmentStart(record.getMateAlignmentStart());
                record.setReadNegativeStrandFlag(record.getMateNegativeStrandFlag());
              } else {
                record.setMateReferenceName(record.getReferenceName());
                record.setMateAlignmentStart(record.getAlignmentStart());
                record.setMateNegativeStrandFlag(record.getReadNegativeStrandFlag()); 
              }
            }
            
            return record;
          }
          
          /**
           * Fetches next read, dealing with injection of unmapped mate pairs if needed.
           */
          private Read getNextRead() {
            // Are we iterating through unmapped mates ?
            if (unmappedMatesIterator != null) {
              if (unmappedMatesIterator.hasNext()) {
                return unmappedMatesIterator.next();
              } else {
                unmappedMatesIterator = null;
                mappedRead = null;
              }
            }
            
            Read nextReadToReturn = getNextReadFromMainIterator();
            if (nextReadToReturn == null) {
              return null;
            }
              
            // If we have unmapped mates to inject, see if we need to do it now
            if (injectingUnmappedPairsOfMappedRead && 
                UnmappedReads.isMappedMateOfUnmappedRead(nextReadToReturn)) {
              final  ArrayList<Read> unmappedMates = unmappedReads
                    .getUnmappedMates(nextReadToReturn);
              if (unmappedMates != null) {
                  unmappedMatesIterator = unmappedMates.iterator();
                  mappedRead = nextReadToReturn;
              }
            }
            return nextReadToReturn;
          }
          
          /**
           * Fetches next read from the underlying iterator, taking care
           * to skipped unmapped mate pairs that we have injected elsewhere.
           */
          private Read getNextReadFromMainIterator() {
            Read result;
            if (readIterator.hasNext()) {
              result = readIterator.next();
              
              if (injectingUnmappedPairsOfMappedRead) {
                // If we are going through unmapped reads, skipped the ones
                // that are mates of mapped ones - we would have injected them.
                while (UnmappedReads.isUnmappedMateOfMappedRead(result)) { 
                  if (readIterator.hasNext()) {
                    result = readIterator.next();
                  } else {
                    return null;
                  }
                }
              }
            } else {
              return null;
            }
            return result;
          }
          
          @Override
          public void remove() {
            LOG.warning("ReadIteratorResource does not implement remove() method");
          }
        };
      }
    };
  }
}
