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
package com.google.cloud.genomics.gatk.picard.runner;

import com.google.cloud.genomics.gatk.common.ReadIteratorResource;

import htsjdk.samtools.SAMFileWriter;
import htsjdk.samtools.SAMFileWriterFactory;
import htsjdk.samtools.SAMRecord;

import java.io.OutputStream;

/**
 * Writes contents of the ReadIteratorResource into the stream as a SAM file.
 */
public class ReadIteratorToSAMFilePump implements SAMFilePump {
  private ReadIteratorResource readIterator;
   
  public ReadIteratorToSAMFilePump(ReadIteratorResource readIterator) {
    this.readIterator = readIterator;
  }
  
  @Override
  public void pump(OutputStream out) {
    final SAMFileWriter outputSam = new SAMFileWriterFactory().makeSAMWriter(
        readIterator.getSAMFileHeader(), true, out);

    for (final SAMRecord samRecord : readIterator.getSAMRecordIterable()) {
        outputSam.addAlignment(samRecord);
    }

    outputSam.close();
  }
}
