
gatk-tools-java
===============
Tools for using Picard and GATK with Genomics API.

- Common classes for getting Reads from GA4GH Genomics API and
exposing them as SAMRecord "Iterable" resource.

- Implementation of a custom reader that can be plugged into Picard tools
to handle reading of the input data specified via a url and coming from GA4GH API.

- A set of shell scripts (src/main/scripts) that demonstrate how to run Picard
tools with Ga4GH custom reader.

- Requires htsjdk version 1.128 and greater and Picard latest version (past this commit https://github.com/iliat/picard/commit/ebe987313d799d58b0673351b95d3ca91fed82bf).

- You can download Picard from: http://broadinstitute.github.io/picard/ and 
build it according to the instructions.

Build:  
To build with ant: 
    ant gatk-tools-java-jar.
    
Note that examples below assume you have built with ant,
it produces dist/gatk-tools-java-1.0.jar
The following examples assume you have picard folder side by side with gatk-tools-java.
  
The typical command line would look like:

    java -jar \  
    -Dsamjdk.custom_reader=https://www.googleapis.com/genomics,<location of gatk-tools-java jar> \  
    -Dga4gh.client_secrets=<location of client_secrets.json>  \   
    dist/picard.jar <ToolName> \  
    INPUT=<input url>  

E.g 

    java -jar \
    -Dsamjdk.custom_reader=https://www.googleapis.com/genomics,com.google.cloud.genomics.gatk.htsjdk.GA4GHReaderFactory,\
    `pwd`/dist/gatk-tools-java-1.0.jar \  
    -Dga4gh.client_secrets=client_secrets.json \  
    ../picard/dist/picard.jar ViewSam \  
    INPUT=https://www.googleapis.com/genomics/v1beta2/readgroupsets/CK256frpGBD44IWHwLP22R4/  
  The test read group set used here is the ex1_sorted.bam that can be found in testdata/ folder.  
  The data has been uploaded to the cloud project: https://console.developers.google.com/project/genomics-test-data/  

To build with Maven: 
    mvn compile
    mvn bundle:bundle.  
Note that Maven build produces gatk-tools-java-1.1-SNAPSHOT.jar.

- For Picard tools that have not yet been instrumented to work with a custom reader,
you can use Ga4GHPicardRunner. 
It is a wrapper around Picard tools that allows for INPUTS into 
Picard tools to be ga4gh:// urls by consuming the data via the API and using pipes 
to send it to Picard tool. 



