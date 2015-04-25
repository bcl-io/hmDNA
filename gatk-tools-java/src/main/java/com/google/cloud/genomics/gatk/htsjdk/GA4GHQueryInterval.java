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

import htsjdk.samtools.util.CoordMath;
import htsjdk.samtools.SAMRecord;

/**
 * Similar to HTSJDK's QueryInterval but allows specifying sequence name 
 * (as opposed to index in the header) and adds ability to check if a given read 
 * matches the interval.
 */
public class GA4GHQueryInterval {
  private String sequence;
  private int start;
  private int end;
   
  public enum ReadPositionConstraint {
    OVERLAPPING,
    CONTAINED,
    START_AT
  }
  private ReadPositionConstraint readPositionConstraint;

  public GA4GHQueryInterval(String sequence, int start, int end,
      ReadPositionConstraint readPositionConstraint) {
    super();
    this.sequence = sequence;
    this.start = start;
    this.end = end;
    this.readPositionConstraint = readPositionConstraint;
  }
  
  public String getSequence() {
    return sequence;
  }
  
  public void setSequence(String sequence) {
    this.sequence = sequence;
  }
  
  public int getStart() {
    return start;
  }
  
  public void setStart(int start) {
    this.start = start;
  }
  
  public int getEnd() {
    return end;
  }
  
  public void setEnd(int end) {
    this.end = end;
  }
  
  public ReadPositionConstraint getReadPositionConstraint() {
    return readPositionConstraint;
  }

  public void setReadPositionConstraint(ReadPositionConstraint readPositionConstraint) {
    this.readPositionConstraint = readPositionConstraint;
  }
  
  /** 
   * Returns true iff the read specified by the record matches the interval
   * given the interval's constraints and the read position.
   */
  public boolean matches(SAMRecord record) {
    int myEnd = end == 0 ? Integer.MAX_VALUE : end;
    switch (readPositionConstraint) {
      case OVERLAPPING:
        return CoordMath.overlaps(start, myEnd, 
            record.getAlignmentStart(), record.getAlignmentEnd());
      case CONTAINED:
        return CoordMath.encloses(start, myEnd,
            record.getAlignmentStart(), record.getAlignmentEnd());
      case START_AT:
        return start == record.getAlignmentStart();
    }
    return false;
  }
}
