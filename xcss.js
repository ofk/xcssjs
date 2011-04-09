/*!
 * eXpanse CSS Library
 * http://github.com/ofk/xcss/
 *
 * @author ofk
 * @license MIT ( http://www.opensource.org/licenses/mit-license.php )
 * @version 2011-03-27
 */

(function (window_, document_) {

var IS_MSIE  = !!document_.uniqueID, //< IEの判定
    IS_MSIE8 = IS_MSIE && !!document_.querySelector, //< IE8の判定
    MEMENTO  = 'xcss-memento', //< IEでのstyle要素のテキストの格納先
    PAGE_URL = location.href.replace(/#[^#]*$/, ''); //< 現在ページのURL

// cssRulesやrulesにアクセスするとstyle要素のテキストが壊れるため、事前に収集しておく。
if (IS_MSIE) {
	(function () {
		var nodes = document_.getElementsByTagName('style');
		for (var i = 0, iz = nodes.length; i < iz; ++i) {
			var node = nodes[i];
			node[MEMENTO] = node.innerHTML;
		}
	}());
}

// xcssの定義
var xcss = window_.xcss = {
	// CSSのパース結果など
	css: [],
	// プロパティー変換(string: string, function)
	properties: {},
	// 値変換(string: string, function)
	values: {},
	// 関数変換(string: string, function)
	functions: {},
	// ベンダープリフィックス
	vendorPrefix: IS_MSIE ? (IS_MSIE8 ? '-ms-' : null) :
	              window_.opera ? '-o-' :
	              window_.Components ? '-moz-' :
	              !navigator.taintEnabled ? '-webkit-' : null,
	// void xcss.run(force:boolean = false)
	run: xcssRun,
	// boolean xcss.isRun()
	isRun: xcssIsRun,
	// void xcss.parser(force:boolean = false)
	parser: xcssParser,
	// void xcss.collect_(csss:object[], sheets:CSSStyleSheet[], base_url:string = PAGE_URL, safe_urls:object = null)
	collect_: xcssCollect_,
	// void xcss.parser_(css:object)
	parser_: xcssParser_,
	// void xcss.attach(force:boolean = false)
	attach: xcssAttach,
	// void xcss.attach_(force:boolean, csss:object[])
	attach_: xcssAttach_,
	// void xcss.removeRules_(css:object)
	removeRules_: xcssRemoveRules_,
	// void xcss.addRules_(css:object)
	addRules_: xcssAddRules_,
	// void xcss.hookRule_(rule:object)
	hookRule_: xcssHookRule_,
	rules: {
		// string xcss.rules.camelize(str:string)
		camelize: xcssRulesCamelize,
		// string xcss.rules.decamelize(str:string)
		decamelize: xcssRulesDecamelize,
		// int xcss.rules.add(selector:string, property:string, sheet:CSSStyleSheet, index:number = null)
		add: xcssRulesAdd,
		// int xcss.rules.remove(sheet:CSSStyleSheet, index:number)
		remove: xcssRulesRemove
	},
	absoluteUrl: {
		// void xcss.absoluteUrl.open()
		open_: xcssAbsoluteUrlOpen_,
		// void xcss.absoluteUrl.close()
		close_: xcssAbsoluteUrlClose_,
		// string xcss.absoluteUrl.get(url:string, base_url:string)
		get: xcssAbsoluteUrlGet
	}
};

var REG_URL  = /^\w+:\/\//,
    REG_NL   = /\s*[\r\n]+/g,
    REG_TRIM = /^\s+|\s+$/g;

//= 実行
// void xcss.run(force:boolean = false)
function xcssRun(force) {
	if (this.isRun()) {
		this.parser(force);
		this.attach(force);
	}
}

//= 実行する必要性があるかどうか
// boolean xcss.isRun()
function xcssIsRun() {
	for (var i in this.properties) return true;
	for (var i in this.values)     return true;
	for (var i in this.functions)  return true;
	return false;
}

// URLが訪問済みかどうかの判定
var collect_visited = {};

//= パーサー
// void xcss.parser(force:boolean = false)
function xcssParser(force) {
	if (force) {
		collect_visited = {};
		this.css = [];
	}
	this.collect_(this.css, document_.styleSheets);
	this.absoluteUrl.close_();
}

//= CSSの収集
// void xcss.collect_(csss:object[], sheets:CSSStyleSheet[], base_url:string = PAGE_URL, safe_urls:object = null)
function xcssCollect_(csss, sheets, base_url, safe_urls) {
	base_url = base_url || PAGE_URL;

	var node_key = IS_MSIE ? 'owningElement' : 'ownerNode', //< 親ノード
	    text_key = IS_MSIE ? MEMENTO : 'textContent', //< style要素のテキスト
	    safe_urls_index = 0;

	for (var i = 0, iz = sheets.length; i < iz; ++i) {
		var sheet = sheets[i];
		// 通常のルールなので離脱
		if (sheet.type === 1) {
			break;
		}
		// cssRules[]の@import読み込みを追跡する
		if (sheet.type === 3) {
			sheet = sheet.styleSheet;
		}
		// style要素なら必ず文字列
		// Cr, Sf, Fx: 常に'text/css'
		// Op: 常に''
		// IE: ノードのtypeに依存する文字列
		if (typeof sheet.type !== 'string') {
			break;
		}

		// CSS外枠の生成
		var css = csss[i];
		if (!css) {
			css = {
				sheet:    sheet, //< CSSStyleSheet
				attached: null,  //< CSSStyleSheetに付与したCSS行数
				href:     null,  //< URL
				text:     null,  //< CSSテキスト
				imports:  null,  //< @import
				rules:    null   //< パース結果
			};
			csss.push(css);
		}

		// CSSStyleSheetが無効ならスキップ
		if (sheet.disabled) {
			continue;
		}

		// データ取得が無かったら取得
		if (css.text === null) {
			// CSSテキストの収集
			var url = sheet.href || null, text;
			// link要素もしくは@import
			if (url && url !== PAGE_URL) {
				// IE8のURL変換
				if (safe_urls) {
					var filename = url.match(/[^\/]*$/)[0];
					for (; safe_urls_index < safe_urls.length; ++safe_urls_index) {
						if (filename === safe_urls[safe_urls_index].name) {
							url = safe_urls[safe_urls_index].path;
							break;
						}
					}
				}
				// URLを絶対URLに
				url = REG_URL.test(url) ? url : this.absoluteUrl.get(url, base_url);
				// 訪問していないURLのみ受信
				if (!collect_visited[url]) {
					collect_visited[url] = true;
					text = loadSync(url) || '';
				}
			}
			// style要素
			else {
				url = null;
				text = sheet[node_key] && sheet[node_key][text_key] || '';
			}
			// 格納
			css.url = url;
			css.text = text.replace(REG_NL, '\n');
			css.rules = null;
		}

		// パース
		if (!css.rules) {
			css.rules = [];
			css.text && this.parser_(css);
		}

		// @import取得
		var next_sheets = sheet.imports || sheet.cssRules;
		if (next_sheets.length) {
			// IE8でURLが壊れる対策
			var safe_urls = null;
			if (IS_MSIE8) {
				safe_urls = [];
				for (var j = 0, jz = css.rules.length; j < jz; ++j) {
					var rule = css.rules[j];
					if (rule.name === '@import') {
						var v = rule.values[0];
						if (v) {
							safe_urls.push({
								path: v.value,
								name: v.value.match(/[^\/]*$/)[0]
							});
						}
					}
					else if (!rule.rule) {
						break;
					}
				}
			}
			css.imports = css.imports || [];
			this.collect_(css.imports, next_sheets, url, safe_urls);
		}
	}
}

// パース用正規表現
var PARSER_REG = /<!--|-->|\/\*[^*]*\*+(?:[^\/][^\*]*\*+)*\/|"[^"]*"|'[^']*'|url\(\s*(?:"[^"]*"|'[^']*'|(?:[!#-~\u00c0-\uFFFF]|\\.)*)\s*\)|U\+[0-9A-F?]{1,6}(-[0-9A-F]{1,6})?|[\+\-]?(?:[0-9]*\.)?[0-9]+(?:%|c[hm]|deg|e[mx]|g(?:rad|d)|in|m[ms]|p[ctx]|r(?:ad|em)|s|turn|v[hmw])?|\s+|!important|[!-\/:-@\[-`{-~]=|[@#]?(?:[a-zA-Z0-9\u00c0-\uFFFF_-]|\\.)+|./g,
    PARSER_RULE = { '@charset': 2, '@import': 3, '@media': 4, '@font-face': 5, '@page': 6 },
    PARSER_RULE_INLINE = { '@font-face': true };

// void xcss.parser_(css:object)
function xcssParser_(css) {
	var words = css.text.match(PARSER_REG),
	    targets = [ css ], index = 0,
	    vtargets = [], vindex = -1,
	    current,
	    is_inline = css.inline;

	var tmp = [];
	for (var i = 0, iz = words.length; i < iz; ++i) {
		var word = words[i];

		// 階層構造の移動準備
		switch (word) {
			case '{':
				// 次の格納先が存在すれば移動
				if (targets[index + 1]) {
					++index;
				}
				// 現在の格納先の情報
				var now_target = targets[index];
				is_inline = now_target.inline;
				if (now_target.name) {
					now_target.name = now_target.name.replace(REG_TRIM, '');
				}
				break;
			case '}':
				// 前の格納先が存在すれば移動
				if (index > 0) {
					--index;
				}
				// 現在の格納先の情報
				is_inline = targets[index].inline;
				break;
		}
		// 強制的に次に行く文字列
		switch (word) {
			// 構造用符号
			case '{':
			case '}':
			case ';':
				if (current && current.value) {
					current.value = current.value.replace(REG_TRIM, '');
				}
				current = null;
				// FALLTHROUGH
			// コメント
			case '<!--':
			case '-->':
				continue;
		}
		// コメント
		if (!word.indexOf('/*')) {
			continue;
		}

		// 空白の処理
		var is_blank = !/\S/.test(word);
		if (is_blank) {
			word = ' ';
		}

		var obj = null;

		// inline
		// prop: value;
		if (is_inline) {
			// インラインの開始
			if (!current) {
				if (is_blank) continue; //< 空白は無視
				current = {
					name:   word,
					value:  '',
					values: []
				};
				targets[index].rules.push(current);
				vindex = -1;
			}
			// インラインの経過
			else {
				// プロパティー名の入力
				if (vindex < 0) {
					if (word === ':') {
						vtargets[++vindex] = current;
					}
					else {
						current.name += word;
					}
					continue;
				}

				var vtarget = vtargets[vindex];
				// 関数の終わり以外を格納
				if (word !== ')') {
					vtarget.value += word;
				}

				if (is_blank) continue; //< 空白は無視

				switch (word) {
					// 関数の開始
					case '(':
						if (vtargets[vindex + 1]) {
							++vindex;
						}
						// 直前のタイプを関数に書き換え
						vtarget = vtargets[vindex];
						vtarget.type = 3;
						vtarget.name = vtarget.value;
						vtarget.value = '';
						vtarget.values = [];
						continue;
					// 関数の離脱
					case ')':
						var tmp = vtarget.value = vtarget.value.replace(REG_TRIM, '');
						vtarget = vtargets[--vindex];
						if (vtarget) {
							vtarget.value += tmp + word;
						}
						continue;
				}

				// TODO: !important の拾い上げ

				obj = parserValue(word);
				vtargets[vindex + 1] = obj;
				vtarget.values.push(obj);
			}

		}
		// block
		// @rule, selector {}
		else {
			// @rule
			if (word.charAt(0) === '@') {
				obj = {
					name:   word,
					values: [],
					rules:  [],
					inline: PARSER_RULE_INLINE[word],
					rule:   PARSER_RULE[word] || 0
				};
			}
			// ブロックの開始
			else if (!current) {
				if (is_blank) continue; //< 空白は無視
				obj = {
					name:   word,
					rules:  [],
					inline: true
				};
			}
			// ブロックの経過
			else {
				// @rule
				if (current.values) {
					if (is_blank) continue; //< 空白は無視
					current.values.push(parserValue(word));
				}
				else {
					current.name += word;
				}
			}

			// ターゲットに追加
			if (obj) {
				targets[index].rules.push(obj);
				targets[index + 1] = obj;
				current = obj;
			}
		}
	}

}

// object parserValue(value:string)
var PARSER_VALUE_REG = /^(?:(\s+|[!-\/:-@\[-`{-~])|"([^"]*)"|'([^']*)'|url\(\s*(?:"([^"]*)"|'([^']*)'|((?:[!#-~\u00c0-\uFFFF]|\\.)*))\s*\)|([\+\-]?)([0-9]*\.)?([0-9]+)(%|c[hm]|deg|e[mx]|g(?:rad|d)|in|m[ms]|p[ctx]|r(?:ad|em)|s|turn|v[hmw])?)$/,
    PARSER_VALUE_SIGN_REG = /^$/,
    PARSER_VALUE_STRING_REG = /\\0*([0-9a-f]*)/ig,
    PARSER_VALUE_STRING_FUNC = function ($0, $1) { return String.fromCharCode(parseInt($1 || 0, 16)); };
function parserValue(value) {
	var m = PARSER_VALUE_REG.exec(value);
	// キーワード
	if (m && !m[1]) {
		// "...", '...'
		if (m[2] || m[3]) {
			return {
				type: 2,
				quote: m[2] ? '"' : "'",
				value: (m[2] || m[3]).replace(PARSER_VALUE_STRING_REG, PARSER_VALUE_STRING_FUNC),
				original: value
			};
		}
		// url("..."), url('...')
		if (m[4] || m[5]) {
			value = (m[4] || m[5]).replace(PARSER_VALUE_STRING_REG, PARSER_VALUE_STRING_FUNC);
			return {
				type: 3,
				name: 'url',
				quote: m[4] ? '"' : "'",
				value: value,
				values: [ parserValue(value) ],
				original: value
			};
		}
		// url(...)
		if (m[6]) {
			value = m[6];
			return {
				type: 3,
				name: 'url',
				value: value,
				values: [ parserValue(value) ],
				original: value
			};
		}
		// 数値
		if (m[9]) {
			return {
				type: 1,
				unit: m[10] || '',
				value: parseFloat((m[7] || '') + (m[8] === '.' ? '0.' : m[8] || '') + m[9]),
				original: value
			};
		}

	}
	return {
		type: m || value === '!important' ? 0 : 1,
		value: value,
		original: value
	};
}

// void xcss.attach(force:boolean = false)
function xcssAttach(force) {
	this.attach_(force, this.css);
}

// void xcss.attach_(force:boolean, csss:object[])
function xcssAttach_(force, csss) { //< forceは現在利用していない
	for (var i = 0, iz = csss.length; i < iz; ++i) {
		var css = csss[i];
		// @importの展開
		if (css.imports && css.imports.length) {
			this.attach_(force, css.imports);
		}
		// ルールの削除
		if (css.attached) {
			this.removeRules_(css);
		}
		// ルールの展開
		if (css.rules && css.rules.length) {
			this.addRules_(css);
		}
	}
}

// void xcss.removeRules_(css:object)
function xcssRemoveRules_(css) {
	while (css.attached) {
		this.rules.remove(css.sheet, 0);
		--css.attached;
	}
}

// void xcss.addRules_(css:object)
function xcssAddRules_(css) {
	// 後ろのルールから順に処理する
	var start = IS_MSIE ? 0 : css.imports.length;
	for (var i = css.rules.length - 1; i >= 0; --i) {
		var ruleset = css.rules[i];

		// @rule
		// TODO: 後で対応する
		if (ruleset.name.charAt(0) === '@') {
			continue;
		}

		// 変更するプロパティーを検査する
		var rules = ruleset.rules, props = '';
		for (var j = 0, jz = rules.length; j < jz; ++j) {
			var prop = this.hookRule_(rules[j]);
			if (prop) {
				props += prop;
			}
		}

		// 変更がある場合は先頭に追加
		if (props) {
			this.rules.add(ruleset.name, props, css.sheet, start);
		}
	}
}

// void xcss.hookRule_(rule:object)
function xcssHookRule_(rule) {
	// 'property' => 'new-property'
	// 'property' => function (value, ...) { return null; };
	// 'property' => function (value, ...) { return 'new-property'; };
	// 'property' => function (value, ...) { return { 'new-property': 'new-value', ... }; };
	// 'value'    => 'new-value'
	// 'value'    => function (property) { return null; }
	// 'value'    => function (property) { return 'new-value'; }
	// 'value'    => function (property) { return { 'new-property': 'new-value', ... }; }
	// 'function' => 'new-function'
	// 'function' => function (arg, ...) { return null; };
	// 'function' => function (arg, ...) { return 'new-function(new-args, ...)'; };
	// 'function' => function (arg, ...) { return { 'new-property': 'new-value', ... }; };
	var props = {}, str = '',
	    rprop = hookRun(this.properties[rule.name], [ rule.value ], rule, props),
	    rvals = hookRunRecursive(rule, props);

	if (rprop || rvals.updated) {
		props[rprop || rule.name] = rvals.results.join(' ');
	}

	for (var i in props) {
		str += i + ':' + props[i] + ';';
	}

	return str;
}

// string hookRun(result:mixed, args:array, me:object, props:object)
function hookRun(result, args, me, props) {
	// 空
	if (!result) {
		return null;
	}

	// 関数なら実行
	if (typeof result === 'function') {
		result = result.apply(me, args);
		if (!result) {
			return null;
		}
		if (typeof result === 'object') {
			for (var i in result) {
				props[xcss.rules.decamelize(i)] = result[i];
			}
			return null;
		}
	}

	return result;
}

// { results: array, updated: boolean } hookRunRecursive(rule:object, props:object)
function hookRunRecursive(rule, props) {
	var results = [], updated = false;
	for (var i = 0, iz = rule.values.length; i < iz; ++i) {
		var valueset = rule.values[i];
		switch (valueset.type) {
			// 区切り記号
			case 0:
			// 文字列
			case 2:
				results.push(valueset.original);
				break;
			// 値
			case 1:
				var rval = hookRun(xcss.values[valueset.value], [ rule.name, rule.value ], rule, props);
				if (rval) {
					updated = true;
				}
				results.push(rval || valueset.original);
				break;
			// 関数
			case 3:
				var rval = hookRunRecursive(valueset, props), args = [];
				if (rval.updated) {
					updated = true;
				}
				// 引数の生成
				for (var j = 0, jz = rval.results.length, c = 0; j < jz; ++j) {
					var arg = rval.results[j];
					// 区切り符号
					if (arg === ',') {
						++c;
						continue;
					}
					if (args[c]) {
						args[c] += ' ' + arg;
					}
					else {
						args[c] = arg;
					}
				}
				var name = valueset.name,
				    func = xcss.functions[name],
				    fres = typeof func === 'function' ? hookRun(func, args, rule, props) : null;
				// 関数による文字列置き換え
				if (fres) {
					updated = true;
					results.push(fres);
				}
				else {
					// 関数名置き換え
					if (func) {
						updated = true;
						name = func;
					}
					results.push(name + '(' + (rval.updated ? args.join(',') : valueset.value) + ')');
				}
				break;
		}

	}
	return { results: results, updated: updated };
}

//= キャメルケース変換
// string xcss.rules.camelize(str:string)
var CAMELIZE_REG = /-([a-z])/g,
    CAMELIZE_FUNC = function ($0, $1) { return $1.toUpperCase(); }
function xcssRulesCamelize(str) {
	return str.replace(CAMELIZE_REG, CAMELIZE_FUNC);
}

//= キャメルケース逆変換
// string xcss.rules.decamelize(str:string)
var DECAMELIZE_REG = /([A-Z])/g;
function xcssRulesDecamelize(str) {
	return str.replace(DECAMELIZE_REG, '-$1').toLowerCase();
}


//= CSSルールの追加
// int xcss.rules.add(selector:string, property:string, sheet:CSSStyleSheet, index:number = null)
function xcssRulesAdd(selector, property, sheet, index) {
	// W3C
	if (sheet.insertRule) {
		return sheet.insertRule(selector + '{' + property + '}', index == null ? sheet.cssRules.length : index);
	}
	// IE
	if (sheet.addRule) {
		return sheet.addRule(selector, property, index == null ? sheet.rules.length : index);
	}

	return null;
}

//= CSSルールの削除
// int xcss.rules.remove(sheet:CSSStyleSheet, index:number)
function xcssRulesRemove(sheet, index) {
	sheet.deleteRule(index);
}


//= 絶対URL用のノード生成
// void xcss.absoluteUrl.open()
function xcssAbsoluteUrlOpen_() {
	// 隠しiframeの生成
	var iframe = this.iframe_ = document_.createElement('iframe');
	iframe.style.display = 'none';
	document_.documentElement.appendChild(iframe);

	// iframeのHTML生成
	var iframe_document = iframe.contentWindow.document;
	iframe_document.open();
	iframe_document.write('<!DOCTYPE html><html><head><base /></head><body></body></html>');
	iframe_document.close();

	// baseタグ，bodyタグの取得
	this.base_ = iframe_document.getElementsByTagName('base')[0];
	this.body_ = iframe_document.body;
}

//= 絶対URL用のノード破棄
// void xcss.absoluteUrl.close()
function xcssAbsoluteUrlClose_() {
	if (this.iframe_) {
		this.body_ = null;
		this.base_ = null;
		this.iframe_.parentNode.removeChild(this.iframe_);
		this.iframe_ = null;
	}
}

//= 絶対URL取得
// string xcss.absoluteUrl.get(url:string, base_url:string)
function xcssAbsoluteUrlGet(url, base_url) {
	// ノード生成
	if (!this.iframe_) {
		this.open_();
	}

	this.base_.href = base_url;
	var body = this.body_;
	body.innerHTML = '<a href="' + url + '" />';

	// TODO: 理由を思い出す
	return body.firstChild ? body.firstChild.href
	                       : /href\="([^"]+)"/.exec(body.innerHTML)[1];
}


//= 同期通信
// string loadSync(url:string)
function loadSync(url) {
	try {
		var xhr = window_.XMLHttpRequest ? new XMLHttpRequest()
		                                 : new ActiveXObject('Microsoft.XMLHTTP');
		xhr.open('GET', url, false); //< sync
		xhr.send(null);
		if (xhr.status === 200 || !xhr.status) {
			return xhr.responseText;
		}
	} catch (e) {}
	return '';
}

}(this, document));

/*
 * eXpanse CSS Library Run
 * http://github.com/ofk/xcss/
 *
 * @author ofk
 * @license MIT ( http://www.opensource.org/licenses/mit-license.php )
 * @version 2011-03-27
 */

(function (xcss, document_) {

// 変換先ペア
// 'property' => 'new-property'
// 'property' => function (value, ...) { return null; };
// 'property' => function (value, ...) { return 'new-property'; };
// 'property' => function (value, ...) { return { 'new-property': 'new-value', ... }; };
// 'value'    => 'new-value'
// 'value'    => function (property) { return null; }
// 'value'    => function (property) { return 'new-value'; }
// 'value'    => function (property) { return { 'new-property': 'new-value', ... }; }
// 'function' => 'new-function'
// 'function' => function (arg, ...) { return null; };
// 'function' => function (arg, ...) { return 'new-function(new-args, ...)'; };
// 'function' => function (arg, ...) { return { 'new-property': 'new-value', ... }; };
var properties = xcss.properties,
    values = xcss.values,
    funcs = xcss.functions,
    root = document_.documentElement,
    view = document_.defaultView,
    isGetComputedStyle = view && view.getComputedStyle,
    div = root.insertBefore(document_.createElement('div'), root.firstChild),
    divStyle = div.style,
    divComputedStyle = isGetComputedStyle ? view.getComputedStyle(div, null) : div.currentStyle,
    vendorPrefix = xcss.vendorPrefix;

// string getCSS(name:string)
var getCSS = isGetComputedStyle ? function (name) {
	return '' + divComputedStyle.getPropertyValue(xcss.rules.decamelize(name));
} : function (name) {
	return '' + divComputedStyle[xcss.rules.camelize(name)];
};

// number range(num:number, min:number, max:number)
function range(num, min, max) {
	return Math.min(Math.max(min, num), max);
}

// boolean vendorProperty(name:string, flag:boolean = false)
function vendorProperty(name, flag) {
	// 実装済み
	if (divStyle[xcss.rules.camelize(name)] !== void 0) {
		return true;
	}
	// ベンダープリフィックス付き実装済み
	if (!flag) {
		if (vendorPrefix && divStyle[xcss.rules.camelize(vendorPrefix + name)] !== void 0) {
			properties[name] = vendorPrefix + name;
			return true;
		}
	}

	// 実装無し
	return false;
}

// boolean vendorValueBase(target:object, name:string, value:string, args:string, flag:boolean = false)
function vendorValueBase(target, name, value, args, flag) {
	var camelize_name = xcss.rules.camelize(name);
	// 値の設定
	try {
		divStyle[camelize_name] = value + args;
		if (getCSS(name).indexOf(value) !== -1) {
			return true;
		}
	} catch (e) {}

	// ベンダープリフィックス付きもテスト
	if (!flag && vendorPrefix) {
		var vp_value = vendorPrefix + value;
		try {
			divStyle[camelize_name] = vp_value + args;
			if (getCSS(name).indexOf(vp_value) !== -1) {
				target[value] = vp_value;
				return true;
			}
		} catch (e) {}
	}

	// 実装無し
	return false;
}

// boolean vendorValue(name:string, value:string, flag:boolean = false)
function vendorValue(name, value, flag) {
	return vendorValueBase(values, name, value, '', flag);
}

// boolean vendorFunction(name:string, func:string, args:string, flag:boolean = false)
function vendorFunction(name, func, args, flag) {
	return vendorValueBase(funcs, name, func, '(' + args + ')', flag);
}

//= multi-column
vendorProperty('column-count');
vendorProperty('column-gap');
vendorProperty('column-rule');
vendorProperty('column-rule-color');
vendorProperty('column-rule-style');
vendorProperty('column-rule-width');
vendorProperty('column-span');
vendorProperty('column-width');
vendorProperty('columns');
vendorProperty('float-offset');

//= animation
// @keyframesは未対応
vendorProperty('animation');
vendorProperty('animation-delay');
vendorProperty('animation-direction');
vendorProperty('animation-duration');
vendorProperty('animation-iteration-count');
vendorProperty('animation-name');
vendorProperty('animation-play-state');
vendorProperty('animation-timing-function');

//= grid
vendorProperty('grid-columns');
vendorProperty('grid-rows');

//= text
vendorProperty('hanging-punctuation');
vendorProperty('line-break');
vendorProperty('punctuation-trim');
vendorProperty('text-align-last');
vendorProperty('text-autospace');
vendorProperty('text-decoration');
vendorProperty('text-decoration-color');
vendorProperty('text-decoration-line');
vendorProperty('text-decoration-skip');
vendorProperty('text-decoration-style');
vendorProperty('text-emphasis');
vendorProperty('text-emphasis-color');
vendorProperty('text-emphasis-position');
vendorProperty('text-emphasis-style');
vendorProperty('text-justify');
vendorProperty('text-outline');
vendorProperty('text-shadow');
vendorProperty('text-underline-position');
vendorProperty('white-space-collapsing');
vendorProperty('word-break');
vendorProperty('word-wrap');

//= hyperlink
vendorProperty('target');
vendorProperty('target-name');
vendorProperty('target-new');
vendorProperty('target-position');

//= border
vendorProperty('border-image');
vendorProperty('border-image-outset');
vendorProperty('border-image-repeat');
vendorProperty('border-image-slice');
vendorProperty('border-image-source');
vendorProperty('border-image-width');
vendorProperty('border-radius');
if (!vendorProperty('border-top-left-radius') && vendorProperty(vendorPrefix + 'border-radius-topleft', true)) {
	properties['border-top-left-radius'] = vendorPrefix + 'border-radius-topleft'
}
if (!vendorProperty('border-top-right-radius') && vendorProperty(vendorPrefix + 'border-radius-topright', true)) {
	properties['border-top-right-radius'] = vendorPrefix + 'border-radius-topright'
}
if (!vendorProperty('border-bottom-left-radius') && vendorProperty(vendorPrefix + 'border-radius-bottomleft', true)) {
	properties['border-bottom-left-radius'] = vendorPrefix + 'border-radius-bottomleft'
}
if (!vendorProperty('border-bottom-right-radius') && vendorProperty(vendorPrefix + 'border-radius-bottomright', true)) {
	properties['border-bottom-right-radius'] = vendorPrefix + 'border-radius-bottomright'
}
vendorProperty('box-align');
vendorProperty('box-decoration-break');
vendorProperty('box-direction');
vendorProperty('box-flex');
vendorProperty('box-lines');
vendorProperty('box-ordinal-group');
vendorProperty('box-orient');
vendorProperty('box-pack');
vendorProperty('box-shadow');
vendorProperty('rotation');
vendorProperty('rotation-point');

//= marquee
// vendorProperty('marquee-direction');
// vendorProperty('marquee-loop');
// vendorProperty('marquee-play-count');
// vendorProperty('marquee-speed');
// vendorProperty('marquee-style');
// vendorProperty('overflow-style');
// -webkit-marquee-repetition

//= ui
vendorProperty('box-sizing');
vendorProperty('nav-index');
vendorProperty('nav-x');
vendorProperty('outline');
vendorProperty('outline-color');
vendorProperty('outline-offset');
vendorProperty('outline-style');
vendorProperty('outline-width');
vendorProperty('resize');
vendorProperty('text-overflow');

//= transform
vendorProperty('transform');
vendorProperty('transform-origin');
vendorProperty('transform-style');

//= background
vendorProperty('background-clip');
vendorProperty('background-origin');
vendorProperty('background-size');
if (!vendorProperty('opacity')) {
	if (vendorProperty('filter', true)) {
		properties.opacity = function () {
			if (this.values[0]) {
				return {
					zoom: 1,
					filter: 'alpha(opacity=' + range((this.values[0].value * 100) | 0, 0, 100) + ')'
				};
			}
		};
	}
}

//= transition
vendorProperty('transition');
vendorProperty('transition-delay');
vendorProperty('transition-duration');
vendorProperty('transition-property');
vendorProperty('transition-timing-function');

//= linear-gradient
if (!vendorFunction('background-image', 'linear-gradient', '#000 0%, #000 100%')) {
	if (vendorFunction('background-image', '-webkit-gradient', 'linear,left top,left bottom,color-stop(0,#000),color-stop(1,#000)', true)) {
		xcss.functions['linear-gradient'] = function () {
			var args = [ 'linear', 'left top', 'left bottom' ];
			for (var i = 0, iz = arguments.length; i < iz; ++i) {
				var m = /^(.*?)\s+(?:([\d\.]+)%|([0\.]+))$/.exec(arguments[i]);
				if (!m) return null;
				args.push('color-stop(' + Math.min(Math.max(0, parseFloat(m[3] || m[2]) / 100), 1) + ',' + m[1] + ')');
			}
			return '-webkit-gradient(' + args.join(',') + ')';
		};
	}
	else if (window.atob && window.btoa && vendorFunction('background-image', 'url', '"data:image/svg+xml;base64,' + btoa('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" version="1.0"><defs><linearGradient x1="0" y1="0" x2="0" y2="100%" id="gradient"><stop offset="0%" style="stop-color:rgba(255,255,255,0.5);"/><stop offset="100%" style="stop-color:rgba(255,255,255,0);"/></linearGradient></defs><rect x="0" y="0" fill="url(#gradient)" width="100%" height="100%"/></svg>') + '"', true)) {
		xcss.functions['linear-gradient'] = function () {
			var xml = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" version="1.0"><defs><linearGradient x1="0" y1="0" x2="0" y2="100%" id="gradient">';
			for (var i = 0, iz = arguments.length; i < iz; ++i) {
				var m = /^(.*?)\s+([\d\.]+%|[0\.]+)$/.exec(arguments[i]);
				if (!m) return null;
				xml += '<stop offset="' + m[2] + '" style="stop-color:' + m[1] + ';"/>';
			}
			xml += '</linearGradient></defs><rect x="0" y="0" fill="url(#gradient)" width="100%" height="100%"/></svg>';
			return 'url("data:image/svg+xml;base64,' + btoa(xml) + '")';
		};
	}
	else if (divStyle.filter != null) {
		function to16(v) {
			v = /%$/.test(v) ? parseFloat(v.slice(-1)) / 100 * 255 : parseFloat(v);
			v = range(v|0, 0, 255);
			return ('0' + v.toString(16)).slice(-2);
		}
		function tocc(v) {
			var m;
			if (m = /^#[0-9a-f]{3}[0-9a-f]{3}?/i.exec(v)) {
				return m[0];
			}
			if (m = /rgb\(\s*([0-9]+%?)\s*,\s*([0-9]+%?)\s*,\s*([0-9]+%?)\s*\)/.exec(v)) {
				return '#' + to16(m[1]) + to16(m[2]) + to16(m[3]);
			}
			if (m = /rgba\(\s*([0-9]+%?)\s*,\s*([0-9]+%?)\s*,\s*([0-9]+%?)\s*,\s*([0-9\.]+%?)\s*\)/.exec(v)) {
				var a = m[4];
				a = /%$/.test(a) ? parseFloat(a.slice(-1)) / 100 : parseFloat(a.charAt(0) === '.' ? '0' + a : a);
				return '#' + to16(a * 255) + to16(m[1]) + to16(m[2]) + to16(m[3]);
			}
		}
		xcss.functions['linear-gradient'] = function () {
			if (arguments.length === 2) {
				var start = tocc(arguments[0]),
				    end   = tocc(arguments[1]);
				if (start && end) {
					return {
						zoom: 1,
						filter: 'progid:DXImageTransform.Microsoft.gradient(startcolorstr=' + start + ',endcolorstr=' + end + ')'
					};
				}
			}
		};
	}
}

root.removeChild(div);

}(xcss, document));

//window.onload = function () { xcss.run(); };
xcss.run();
