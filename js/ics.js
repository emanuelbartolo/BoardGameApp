/*
https://github.com/nwcell/ics.js/

The MIT License (MIT)

Copyright (c) 2014-2017 Travis Webb

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

var ics = function() {
'use strict';

if (navigator.userAgent.indexOf('MSIE') > -1 && navigator.userAgent.indexOf('MSIE 10') == -1) {
	console.log('Unsupported Browser');
	return;
}

var SEPARATOR = (navigator.appVersion.indexOf('Win') !== -1) ? '\r\n' : '\n';

var calendarEvents = [];

var calendarStart = [
	'BEGIN:VCALENDAR',
	'VERSION:2.0'
].join(SEPARATOR);

var calendarEnd = 'END:VCALENDAR';

return {
	/**
	 * Returns events array
	 * @return {array} Events
	 */
	'events': function() {
		return calendarEvents;
	},

	/**
	 * Returns calendar
	 * @return {string} Calendar in iCalendar format
	 */
	'calendar': function() {
		return calendarStart + SEPARATOR + calendarEvents.join(SEPARATOR) + SEPARATOR + calendarEnd;
	},

	/**
	 * Add event to the calendar
	 * @param  {string} subject     Subject/Title of event
	 * @param  {string} description Description of event
	 * @param  {string} location    Location of event
	 * @param  {string} begin       Beginning date of event
	 * @param  {string} stop        Ending date of event
	 */
	'addEvent': function(subject, description, location, begin, stop) {
		//TODO add time and time zone? use moment to format?
		var start_date = new Date(begin);
		var end_date = new Date(stop);

		var start_year = ("0000" + (start_date.getFullYear().toString())).slice(-4);
		var start_month = ("00" + ((start_date.getMonth() + 1).toString())).slice(-2);
		var start_day = ("00" + ((start_date.getDate()).toString())).slice(-2);
		var start_hours = ("00" + (start_date.getHours().toString())).slice(-2);
		var start_minutes = ("00" + (start_date.getMinutes().toString())).slice(-2);
		var start_seconds = ("00" + (start_date.getSeconds().toString())).slice(-2);

		var end_year = ("0000" + (end_date.getFullYear().toString())).slice(-4);
		var end_month = ("00" + ((end_date.getMonth() + 1).toString())).slice(-2);
		var end_day = ("00" + ((end_date.getDate()).toString())).slice(-2);
		var end_hours = ("00" + (end_date.getHours().toString())).slice(-2);
		var end_minutes = ("00" + (end_date.getMinutes().toString())).slice(-2);
		var end_seconds = ("00" + (end_date.getSeconds().toString())).slice(-2);

		var start_time = '';
		var end_time = '';

		if (start_minutes + start_seconds + end_minutes + end_seconds !== 0) {
			start_time = 'T' + start_hours + start_minutes + start_seconds;
			end_time = 'T' + end_hours + end_minutes + end_seconds;
		}

		var start = start_year + start_month + start_day + start_time;
		var end = end_year + end_month + end_day + end_time;
		
		var calendarEvent = [
			'BEGIN:VEVENT',
			'CLASS:PUBLIC',
			'DESCRIPTION:' + description,
			'DTSTART;VALUE=DATE:' + start,
			'DTEND;VALUE=DATE:' + end,
			'LOCATION:' + location,
			'SUMMARY;LANGUAGE=en-us:' + subject,
			'TRANSP:TRANSPARENT',
			'END:VEVENT'
		];

		calendarEvent = calendarEvent.join(SEPARATOR);
		
		calendarEvents.push(calendarEvent);
		return calendarEvent;
	},

	/**
	 * Download calendar
	 * @param  {string} filename Filename
	 * @param  {string} ext      Extention
	 */
	'download': function(filename, ext) {
		if (calendarEvents.length < 1) {
			return false;
		}

		ext = (typeof ext !== 'undefined') ? ext : '.ics';
		filename = (typeof filename !== 'undefined') ? filename : 'calendar';
		var calendar = calendarStart + SEPARATOR + calendarEvents.join(SEPARATOR) + SEPARATOR + calendarEnd;
		
		var blob;
		if (navigator.userAgent.indexOf('MSIE 10') === -1) { // chrome or firefox
			blob = new Blob([calendar]);
		} else { // ie
			var bb = new BlobBuilder();
			bb.append(calendar);
			blob = bb.getBlob('text/x-vCalendar;charset=' + document.characterSet);
		}
		var link = document.createElement('a');
		link.href = window.URL.createObjectURL(blob);
		link.setAttribute('download', filename + ext);
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}
};
};
