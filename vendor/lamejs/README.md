# lamejs

The MP3 encoder the Converter uses (`core/encode-worker.js`), unmodified, from https://github.com/zhuker/lamejs
(a JavaScript port of LAME). It's covered by the LGPL (see LICENSE): it's kept here as its own file, loaded
only when converting to MP3, and can be swapped for any other build of lamejs.
