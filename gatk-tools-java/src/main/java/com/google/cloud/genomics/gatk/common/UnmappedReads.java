package com.google.cloud.genomics.gatk.common;

import com.google.api.services.genomics.model.Position;
import com.google.api.services.genomics.model.Read;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

/**
 * In-memory container for unmapped reads, so we can inject them
 * at the right positions to satisfy Picard tools expectations of the order,
 * which are violated by the current API implementation.
 * See https://github.com/ga4gh/schemas/issues/224
 * SAM format *best practice* (not requirement), states:
 * "For a unmapped paired-end or mate-pair read whose mate is mapped, the unmapped read should have RNAME and POS identical to its mate."
 * But the API returns pairs where an unmapped mate has no alignment
 * and references its mapped mate and so fails this condition.
 * We fix this by reading all unmapped reads and injecting them right after their mapped mates
 * as we iterate.
 * This is NOT feasible if the number of unmapped reads is very large.
 * We detect this condition and if that happens we will output such unmapped
 * reads with flags changed to make it look like they are not paired.
 * Since most of the tools do precious little with unmapped reads we hope
 * we can get away with this.
 */
public class UnmappedReads {
  private static final Logger LOG = Logger.getLogger(UnmappedReads.class.getName());
  
  /**
   * Maximum number of reads we are prepared to keep in memory.
   * If this number is exceeded, we will switch to the mode of ignoring
   * unmapped mate pairs.
   */
  private static final long MAX_READS = 100000000;
  
  public static boolean isUnmappedMateOfMappedRead(Read read) {
    final boolean paired = (read.getNumberReads() != null && 
        read.getNumberReads() >= 2);
    if (!paired) {
      return false;
    }
    final boolean unmapped = (read.getAlignment() == null || 
        read.getAlignment().getPosition() == null || 
        read.getAlignment().getPosition().getPosition() == null);
    if (!unmapped) {
      return false;
    }
    final Position matePosition = read.getNextMatePosition();
    if  (matePosition == null) {
      return false;
    }
    if (read.getFragmentName() == null) {
      return false;
    }
    if (matePosition.getReferenceName() != null && matePosition.getPosition() != null) {
      return true;
    }
    return false;
  }
  
  public static boolean isMappedMateOfUnmappedRead(Read read) {
    return read.getNumberReads() > 0 && 
        (read.getNextMatePosition() == null || 
         read.getNextMatePosition().getPosition() == null);
  }
  
  /**
   * Checks and adds the read if we need to remember it for injection.
   * Returns true if the read was added.
   */
  public boolean maybeAddRead(Read read) {
    if (!isUnmappedMateOfMappedRead(read)) {
      return false;
    }
    final String reference = read.getNextMatePosition().getReferenceName();
    String key = getReadKey(read);
    Map<String, ArrayList<Read>> reads = unmappedReads.get(reference);
    if (reads == null) {
      reads = new HashMap<String, ArrayList<Read>>();
      unmappedReads.put(reference, reads);
    }
    ArrayList<Read> mates = reads.get(key);
    if (mates == null) {
      mates = new ArrayList<Read>();
      reads.put(key, mates);
    }
    if (getReadCount() < MAX_READS) {
      mates.add(read);
      readCount++;
      return true;
    } else {
      LOG.warning("Reached the limit of in-memory unmapped mates for injection.");
    }
    return false;
  }
  
  /**
   * Checks if the passed read has unmapped mates that need to be injected and
   * if so - returns them. The returned list is sorted by read number to
   * handle the case of multi-read fragments.
   */
  public ArrayList<Read> getUnmappedMates(Read read) {
    if (read.getNumberReads() == null ||
        read.getNumberReads() < 2 ||
        (read.getNextMatePosition() != null && 
        read.getNextMatePosition().getPosition() != null) ||
        read.getAlignment() == null ||
        read.getAlignment().getPosition() == null ||
        read.getAlignment().getPosition().getReferenceName() == null ||
        read.getFragmentName() == null) {
      return null;
    }
    final String reference = read.getAlignment().getPosition().getReferenceName();
    final String key = getReadKey(read);
    
    Map<String, ArrayList<Read>> reads = unmappedReads.get(reference);
    if (reads != null) {
      final ArrayList<Read> mates = reads.get(key);
      if (mates != null && mates.size() > 1) {
        Collections.sort(mates, matesComparator);
      }
      return mates;
    }
    return null;
  }
  
  public long getReadCount() {
    return readCount;
  }
  
  private static String getReadKey(Read read) {
    return read.getFragmentName();
  }
  
  private static Comparator<Read> matesComparator = new Comparator<Read>() {
    @Override
    public int compare(Read r1, Read r2) {
        return r1.getReadNumber() - r2.getReadNumber();
    }
  };
  
  private Map<String, Map<String, ArrayList<Read>>> unmappedReads = 
      new HashMap<String, Map<String, ArrayList<Read>>>();
  
  private long readCount = 0;
}
