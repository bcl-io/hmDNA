#!/bin/bash
# Runs Picard tool specified on the command line, using GA4GH custom reader
# for getting the data from url based INPUTs.
# E.g. run_picard.sh ViewSam INPUT=<url>.
# Assumes directory structure where gatk-tools-java and picard repos reside
# in the same folder and client_secrets is in the same folder:
# .../...
#          /gatk-tools-java
#          /picard
#          /client_secrets.json
# If your setup is different, please modify paths below.
GATK_TOOLS_JAVA_JAR=$(readlink -f ../../../dist/gatk-tools-java-1.0.jar)
CLIENT_SECRETS=$(readlink -f ../../../../client_secrets.json)
PICARD_JAR=$(readlink -f ../../../../picard/dist/picard.jar)

echo Running Picard form $PICARD_JAR
echo Using gatk-tools-java from $GATK_TOOLS_JAVA_JAR
echo Using client_secrets form $CLIENT_SECRETS

java -jar \
-Dsamjdk.custom_reader=https://www.googleapis.com/genomics,\
com.google.cloud.genomics.gatk.htsjdk.GA4GHReaderFactory,\
$GATK_TOOLS_JAVA_JAR \
-Dga4gh.client_secrets=$CLIENT_SECRETS \
$PICARD_JAR \
"$@" \
VERBOSITY=DEBUG QUIET=false