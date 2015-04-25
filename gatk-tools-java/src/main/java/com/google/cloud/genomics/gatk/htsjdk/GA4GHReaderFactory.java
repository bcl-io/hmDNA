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

import htsjdk.samtools.CustomReaderFactory;
import htsjdk.samtools.SamReader;

import java.net.URL;
import java.util.logging.Logger;
/**
 * HTSJDK CustomReaderFactory implementation.
 * Returns a SamReader that reads data from GA4GH API.
 */
public class GA4GHReaderFactory implements CustomReaderFactory.ICustomReaderFactory {
  private static final Logger LOG = Logger.getLogger(GA4GHReaderFactory.class.getName());
  
  @Override
  public SamReader open(URL url) {
    try {
      return new GA4GHSamReader(url);
    } catch (RuntimeException rex) {
      throw rex;
    } catch (Exception ex) {
      LOG.warning("Error creating SamReader " + ex.toString());
      return null;
    }
  }

}
