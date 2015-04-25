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

import htsjdk.samtools.SAMRecord;
import htsjdk.samtools.SamInputResource;
import htsjdk.samtools.SamReader;
import htsjdk.samtools.SamReaderFactory;

import java.net.MalformedURLException;
import java.net.URL;

/**
 * Example of HTSJDK SamReader and SamReaderFactory class usage.
 * Illustrates how to plug in a custom SamReaderFactory in order to consume
 * data from ga4gh URLs.
 * 
 * To run this we need to specify the custom reader factory for HTSJDK and set
 * client_secrets file path for Genomics API:
 * -Dsamjdk.custom_reader=https://www.googleapis.com/genomics,com.google.cloud.genomics.gatk.htsjdk.GA4GHReaderFactory 
 * -Dga4gh.client_secrets=<path to client_secrets.json>
 */
public class SamReaderExample {
  static String GA4GH_URL = 
      "https://www.googleapis.com/genomics/v1beta2/readgroupsets/CLqN8Z3sDRCwgrmdkOXjn_sB/*/";
  
  public static void main(String[] args) {  
    try {
      SamReaderFactory factory =  SamReaderFactory.makeDefault();
      
      // If it was a file, we would open like so:
      // factory.open(new File("~/testdata/htsjdk/samtools/uncompressed.sam"));
      // For API access we use SamInputResource constructed from a URL:
      SamReader reader = factory.open(SamInputResource.of(new URL(GA4GH_URL)));
      
      for (final SAMRecord samRecord : reader) {
        System.err.println(samRecord);
      }
    
    } catch (MalformedURLException e) {
      e.printStackTrace();
    }
  }
}
