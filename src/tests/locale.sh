#! /bin/sh
egrep -o '&charlifter[^;]+;' ./chrome/content/lifter.xul | sed 's/^&//;s/;$//' | while read x; do egrep -L $x ./chrome/locale/*/lifter.dtd; done |sort -u |
if egrep 'lifter' 
then
	exit 1
else
	exit 0
fi
