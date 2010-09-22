#! /bin/sh
egrep -o '&charlifter[^;]+;' ./chrome/content/lifter.xul | sed 's/^&//;s/;$//' | while read x; do egrep -L $x ./chrome/locale/*/lifter.dtd; done |sort -u
