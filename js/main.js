// hide the form if the browser doesn't do SVG,
// (then just let everything else fail)
if (!document.createElementNS) {
	document.getElementsByTagName("form")[0].style.display = "none";
}

// field definitions from:
// <http://www.census.gov/popest/data/national/totals/2011/files/NST-EST2011-alldata.pdf>
var percent = (function() {
		var fmt = d3.format(".2f");
		return function(n) {
			return fmt(n) + "%";
		};
	})();

var fields=[{
	name : "(no scale)",		// name is description
	description: "(no scale)",
	descriptionHTML: "(no scale)",
	id : "none"					// id is option value
}];

var years = [ 2012 ];		// we don't have year difference, all data in 2012
var fieldsById={};
var field = fields[0];	// initial field, no scale
var year = years[0];	// initial year, 2010
var colors = colorbrewer.RdYlBu[3]	// 3 colors
		.reverse().map(function(rgb) {
			return d3.hsl(rgb);
		});
//log(colors)
var keywordColors=colorbrewer.Greens[3]	// 3 colors
	.map(function(rgb) {
	return d3.hsl(rgb);
});

var body = d3.select("body");
var stat = d3.select("#status");	// response time
var fieldSelect;

var yearSelect = d3.select("#year").on("change", function(e) {
		year = years[this.selectedIndex];
		location.hash = "#" + [ field.id, year ].join("/");
		//console.log(location.hash);
	});

yearSelect.selectAll("option").data(years).enter()
	.append("option").attr("value", function(y) { return y;	})
	.text(function(y) {	return y; })

var map = d3.select("#map");
var zoom = d3.behavior.zoom()		//Constructs a new zoom behavior.
		.translate([ -38, 32 ])
		.scale(.94)
		.scaleExtent([ 0.5, 10.0 ])
		.on("zoom", updateZoom);
var layer = map.append("g").attr("id", "layer");		// create a layer svg group
var states = layer.append("g").attr("id","states").selectAll("path");	// create a states svg group
//console.log(zoom);
//map.call(zoom);
updateZoom();

function updateZoom() {
	var scale = zoom.scale();
	// transform all layers based on the zoom
	layer.attr("transform", "translate(" + zoom.translate() + ") " + "scale("+ [ scale, scale ] + ")");
}

var proj = d3.geo.albersUsa(), topology, geometries, rawData, dataById = {};
var carto = d3.cartogram().projection(proj)		//function carto(topology, geometries){}
	.properties(function(d) {		// append all properties to each topojson id
		return dataById[d.id];		// function to map the properties to each feature by id
	}).value(function(d) {
		return +d.properties[field];
	});
//console.log(carto);

window.onhashchange = function() {	//The hashchange event fires when a window's hash changes
	parseHash();
};

var segmentized = location.search === "?segmentized";		// false or true
var url = [ "./data", segmentized ? "us-states-segmentized.topojson" : "us-states.topojson" ].join("/");		// ./data/us-states.topojson 
//console.log(url);	

// load and parse the topojson file
var metadata={};
var tokenizer = new natural.WordTokenizer();;
var scoreByWords=[];				//word scores updated each search
var wordsByAllDescription=[];
$(document).ready(function(){
	d3.tsv("./data/meta.tsv", function(meta) {	// Category	Field	Description
		
		meta=meta.filter(function(d){
			//console.log($.inArray(d.Description.split(";")[0], ["Estimate", "Percent"]));
			return ($.inArray(d.Description.split(";")[0], ["Estimate", "Percent"])!=-1);
				//&& d.Description.length<60;
		});
		//console.log(meta);
		metadata=meta;
		meta.forEach(function(d){
			//text_segment=d.Description.split(/[;-]+/);		// filter fields with only percent and estimate values
			//log(text_segment)
			var _description=d.Description.toLowerCase();
			var _field=d.Field;
			var _category=d.Category;
			fields.push({
				name : _description,//text_segment[0].trim()+" "+text_segment[text_segment.length-1].trim(),
				description: _description,
				descriptionHTML: _description,
				id : _field,
				key : _field,
				years : [ 2012 ],
				format : (d.Description.indexOf("Percent") > -1)? percent: "+,",
				category : _category,
				score : 0,				// similarity score by user-defined keywordsf
			});
			wordsByAllDescription=wordsByAllDescription.concat(tokenizer.tokenize(_description));
		});
		wordsByAllDescription=wordsByAllDescription.getUnique();
/*		log(wordsByAllDescription);*/
		fieldsById = d3.nest().key(function(d) { return d.id; })	// group by id, after map id becomes the key
			.rollup(function(d) { /*console.log(d[0]);*/ return d[0]; })	// d[0] is each element in array fields, d[0] becomes the value
			.map(fields);
		
		fieldSelect = d3.select("#field")
			.style("width","475px")
			.on("change", function(e) {
				field = fields[this.selectedIndex];		// this is the current DOM select
				//log(field);
				location.hash = "#" + [ field.id, year ].join("/");		// #popest/2011, in our case it will be all #field/2012 
				//console.log(location.hash);
			});

		fieldSelect.selectAll("option").data(fields)		// the step to create all options
			.enter().append("option")
			.attr("value", function(d) {
				return d.id;
			})
			.text(function(d) {
				return d.name;
			});
		
		d3.json(url, function(topo) {
			topology = topo;	// assign to global variable
			geometries = topology.objects.states.geometries;	// assign to global variable
			d3.csv("./data/ACS_12_1YR_DP02to03_with_ann_3in1.csv", function(data) {
				rawData = data;
				dataById = d3.nest().key(function(d) {
					return d.NAME;		// name of state
				}).rollup(function(d) {
					//log(d[0])		// data for each state
					return d[0];
				}).map(data);
				//log(dataById)
				
		/*		log(topology)
				log(geometries)*/
				init();
			});
		});
	});
})



function search(){
	var keywords=$("#keywords").val().toLowerCase();
	var tokensByKeywords=tokenizer.tokenize(keywords);
	tokensByKeywords=tokensByKeywords.getUnique();
	scoreByWords=[];		// score for all words
	wordsByAllDescription.forEach(function(w){
		tokensByKeywords.forEach(function(kw){		//JaroWinklerDistance, [0,1], the large the better 0.9 is more robust
			var strSimilarityScore=natural.JaroWinklerDistance(kw,w);
			if(strSimilarityScore>0.8){
				scoreByWords[w]=scoreByWords[w] || 0;
				scoreByWords[w]=strSimilarityScore > scoreByWords[w]?strSimilarityScore :  scoreByWords[w];
			}
			var phoneSimilarityScore=natural.Metaphone.compare(kw,w);
			if(phoneSimilarityScore){
				scoreByWords[w]=scoreByWords[w] || 0;
				scoreByWords[w]=phoneSimilarityScore > scoreByWords[w]?0.1 :  scoreByWords[w];
			}
		});
	});
/*	log(scoreByWords)
	log(fields)*/
	
	fields.forEach(function(d){
		d.descriptionHTML=d.description;
		var sumscore=0;
		var _wordsByDescription=tokenizer.tokenize(d.description);	 
		_wordsByDescription=_wordsByDescription.getUnique();
		var count=0;
		var value = function(d) {
			return +d.score;
		};

		//log(values);
		var color = d3.scale.linear()
			.range(keywordColors)
			.domain( [ 0, 0.5, 1]);
		_wordsByDescription.forEach(function(w){
			if(scoreByWords[w]>0){
				sumscore+=scoreByWords[w];
				//count+=1;
				//log(color(scoreByWords[w]))
				d.descriptionHTML=d.descriptionHTML.replace(w,"<span style='color:"+color(scoreByWords[w])+"'>"+w+"</span>");
			}
		});
		d.score=sumscore;
		//log(d.score)
	});
	


	// sort fields
	fields.sort(function(a,b){
		return b.score-a.score;		// <0, a comes first
	})
	//log(fields)
	var multiselect=d3.select("#match");
	multiselect.selectAll("div").remove();
	var _threshold=0.8;
	if(fields[0].score>_threshold){
		selectedFields=fields.splice(0,10);	//get top 5
		d3.select("#match").selectAll("div")
		.data(selectedFields)
		.enter()
		.append("div")
		.attr("class","item")
		.attr("value",function(d){
			return d.id;
		})
		.html(function(d){
			return d.score.toFixed(1)+' '+d.descriptionHTML;
		})
		.on("click", function(e){
			var i = $(this).index() ;
			field = selectedFields[i];		// this is the current DOM select
			location.hash = "#" + [ field.id, year ].join("/");		// #popest/2011, in our case it will be all #field/2012 
		})
	}else{
		multiselect.selectAll("div")
			.text("no match found")
	}
	// add top 5 fields to the list
}

function init() {
	var features = carto.features(topology, geometries);		
	var path = d3.geo.path().projection(proj);
	
	states = states.data(features).enter().append("path")		// draw states svg
			.attr("class", "state").attr("id", function(d) {
				return d.properties.NAME;
			}).attr("fill", "#fafafa").attr("d", path);
	states.append("title");
	//log(states.data())
	parseHash();
}

function reset() {
	stat.text("");
	body.classed("updating", false);
	
	var features = carto.features(topology, geometries);
	var path = d3.geo.path()
			.projection(proj);
	//log(states.data())
	states.data(features).transition().duration(750).ease("linear").attr(
			"fill", "#fafafa").attr("d", path);

	states.select("title").text(function(d) {
		return d.properties.NAME;
	});
}

function update() {
	var start = Date.now();
	body.classed("updating", true);
	var key = field.key.replace("%d", year);	// we shouldn't specify the %d in the key so year becomes irrelevant
	var fmt = (typeof field.format === "function") ? 
			field.format : d3.format(field.format || ",");	// The comma (",") option enables the use of a comma for a thousands separator.
	//log(key);
	//log(fmt);
	var value = function(d) {
			return +d.properties[key];
		};
	//log(states.data());
	var values = states.data().map(value)	//Creates a new array with the results of calling a provided function on every element in this array.
		.filter(function(n) { return !isNaN(n);	})	//The isNaN() function determines whether a value is an illegal number
		.sort(d3.ascending);
	var lo = values[0];
	var hi = values[values.length - 1];
	//log(values);
	var color = d3.scale.linear()
		.range(colors)
		.domain( lo < 0 ? [ lo, 0, hi ] : [ lo, d3.mean(values), hi ]);

	// normalize the scale to positive numbers
	var scale = d3.scale.linear()
		.domain([ lo, hi ])
		.range([ 10, 1000 ]);

	// tell the cartogram to use the scaled values
	carto.value(function(d) {
		return scale(value(d));
	});

	// generate the new features, pre-projected
	var features = carto(topology, geometries).features;

	// update the data
	states.data(features).select("title").text(function(d) {
		return [ d.properties.NAME, fmt(value(d)) ].join(": ");
	});

	states.transition().duration(750)
		.ease("linear")
		.attr("fill", function(d) {
			return color(value(d));
		}).attr("d", carto.path);

	var delta = (Date.now() - start) / 1000;
	stat.text([ "calculated in", delta.toFixed(1), "seconds" ].join(" "));
	body.classed("updating", false);
}

var deferredUpdate = (function() {
	var timeout;
	return function() {
		var args = arguments;
		clearTimeout(timeout);
		stat.text("calculating...");
		//log(args);
		return timeout = setTimeout(function() {
			update.apply(null, arguments);
		}, 10);
	};
})();

var hashish = d3.selectAll("a.hashish").datum(function() {
	return this.href;
});

function log(o){
	console.log(o);
}

function parseHash() {
	//alert(1)
	var parts = location.hash.substr(1).split("/");
	var desiredFieldId = parts[0];
	var desiredYear = +parts[1];
	//log(parts);	//["none", "2011"]
	field = fieldsById[desiredFieldId] || fields[0];	// whichever is defined
	year = (years.indexOf(desiredYear) > -1) ? desiredYear : years[0];

	fieldSelect.property("selectedIndex", fields.indexOf(field));	// switch to the field based on url pattern
	//log(desiredFieldId)
	if (field.id === "none") {
		yearSelect.attr("disabled", "disabled");
		reset();
	} else {
		if (field.years) {
			if (field.years.indexOf(year) === -1) {
				year = field.years[0];
			}
			yearSelect.selectAll("option").attr("disabled", function(y) {
				return (field.years.indexOf(y) === -1) ? "disabled" : null;
			});
		} else {
			yearSelect.selectAll("option").attr("disabled", null);
		}

		yearSelect.property("selectedIndex", years.indexOf(year))
			.attr("disabled", null);

		deferredUpdate();
		location.replace("#" + [ field.id, year ].join("/"));
		hashish.attr("href", function(href) {
			return href + location.hash;
		});
	}
}

Array.prototype.getUnique = function(){
	   var u = {}, a = [];
	   for(var i = 0, l = this.length; i < l; ++i){
	      if(u.hasOwnProperty(this[i])) {
	         continue;
	      }
	      a.push(this[i]);
	      u[this[i]] = 1;
	   }
	   return a;
	}