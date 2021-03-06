// variables to differentiate between single and dblclicks in the handleHighlight function
var DELAY = 250, clicks = 0, timer = null;

// websocket variable (initialized in $(document).ready
var socket;



function getParameterByName(name) {
    name = name.replace(/[\[]/, "\\[").replace(/[\]]/, "\\]");
    var regex = new RegExp("[\\?&]" + name + "=([^&#]*)"),
        results = regex.exec(location.search);
    return results === null ? "" : decodeURIComponent(results[1].replace(/\+/g, " "));
}

function populateSaltsetIndicators() { 
    $("#saltsetA").html(getParameterByName("saltsetA"));
    $("#saltsetB").html(getParameterByName("saltsetB"));
}

function handleHighlights() {
    var mA = $('#modeSelector').val();
    // if we are in a mode that requires highlighting:
    if(mA !== "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch" && mA !== "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch") { 
        // indicate to user that they can click on scrollitems
        $('.scrollitem').css("cursor", "pointer"); 
        // handle the highlighting and display-selected logic:
        handleHighlight('left');
        handleHighlight('right');
    }
    else { 
        // indicate to user that they shouldn't bother clicking on stuff
        $('.scrollitem').css("cursor", "default");
    }
}

function handleHighlight(leftright) {
    // On a single click, we want to invoke the highlight logic
    // On a double click, we want to invoke the loadMatchesForSelected logic
    // i.e. we want to load only those labels (in the other list) that match the dblclicked label 
    // To differentiate between single and double click on the same element, we have to be slightly
    // hacky. See here: https://stackoverflow.com/questions/6330431/jquery-bind-double-click-and-single-click-separately
    $('#'+leftright+' .scrollitem').click(function(e) {
        if($(e.target).is("i") || 
            $(e.target).hasClass("unlisted") || 
            $(e.target).parent().hasClass("unlisted") ){ 
                // if this click event is bubbling up from a click on the eye icon (i.e. the user
                // wanted to toggle listing/unlisting, not highlighting);
                // or, if the clicked scrollitem is currently unlisted;
                // of, if the click was on the internal span of such a scroll item;
                // do not handle highlighting actions for this event
                return;
            }
        var thisElement = $(this);
        clicks++; // count clicks
        if(clicks === 1) { 
            timer = setTimeout(function() {  
                // on single click: select (highlight) if previously unselected, or unselect if previously selected
                if(thisElement.hasClass(leftright+'Highlight')) { 
                    thisElement.removeClass(leftright+'Highlight');
                    $('#rowwiseConfirm').css('display', 'none');
                    $('#bulkConfirm').css('display', 'none');
                    // now that we have no selection, clean up any displayed context as well
                    var target = leftright === "left" ? "right" : "left";
                    $("#"+target+" .contextMatch").removeClass("contextMatch");
                    $("#"+leftright+"Context").html("");
                } else {
                    $('#'+leftright+' .scrollitem').removeClass(leftright+'Highlight');
                    thisElement.addClass(leftright+'Highlight');
                    handleContext(thisElement.attr('title'), leftright);
                    //var saltset = (leftright === "left") ? getParameterByName("saltsetA") : getParameterByName("saltsetB");
                    //socket.emit('specificContextRequest', {saltset:saltset, uri:thisElement.attr('title'), leftright:leftright});
                }
                $('#'+leftright+'Selected').html('');
                $('#'+leftright+'Selected').html($('.'+leftright+'Highlight span').html());
                handleScoreDisplay(); 
                clicks = 0; // reset counter
                // if both sides have a selection, give option to confirm/dispute
                // and also indicate whether this has already been confirmed / disputed
                $("#confDispMsg").css("display", "none");
                if($('#leftSelected').html() && $('#rightSelected').html()) { 
                    var confDispMsg = getConfDispMsg();
                    if(confDispMsg)  {
                        $("#confDispMsg").html(confDispMsg);
                        $("#confDispMsg").css("display", "inline");
                    }
                    $('#singleConfirmDispute').css('display', 'inline');
                    $('#bulkConfirm').css('display', 'none');
                    $('#rowwiseConfirm').css('display', 'none');
                } else { 
                    $('#singleConfirmDispute').css('display', 'none');
                    // if only one side has a selection, give option to bulk confirm
                    if($('#leftSelected').html() || $('#rightSelected').html()) { 
                        $('#bulkConfirm').css('display', 'inline');
                        $('#rowwiseConfirm').css('display', 'none');
                    } else { 
                        $('#bulkConfirm').css('display', 'none');
                        if(modeType() === "matching") { 
                            $('#rowwiseConfirm').css('display', 'inline');
                        }
                    }
                }
            }, DELAY);
        } else {
            // on double click: clear this list, retain the double clicked element,
            // and call loadMatchesForSelected to load up matches on the other list
            // .. but only if we are in a matching mode (i.e. anything but simplelist)
            if($("#modeSelector").val() !== "http://slobr.linkedmusic.org/matchAlgorithm/simpleList") { 
                $('#'+leftright+' .scrollitem').removeClass(leftright+'Highlight');
                $('#'+leftright+' .scrollitem').css('display', 'none');
                thisElement.css('display', 'initial');
                // by double clicking, we are making this item a match reference
                // as such, we should style it differently;
                thisElement.addClass('matchReference');
                // ...and give it a different click behaviour (dbl-click to exit match
                // reference mode, i.e. return to full lists on both sides)
                thisElement.click(function() { clicks = 0; refreshLists();  });
                loadMatchesForSelected(leftright, thisElement.find("span"));
                // since we now have exactly one match reference on this list,
                // enable bulk confirms
                $("#singleConfirmDispute").css("display", "none");
                $("#bulkConfirm").css("display", "inline");
            }
            clearTimeout(timer); // prevent single-click action
            clicks = 0; // reset counter
        }

    });

    $('#'+leftright+' .scrollitem').dblclick(function(e) { 
        e.preventDefault(); // cancel system double-click event in favour of above hack!
    });

    $('#'+leftright+' .scrollitem').mousedown(function(e) { 
        e.preventDefault(); // prevent spurious word selection through double-click
    });
}

function handleConfirmDispute() { 
    $('#bulkConfirm').click(function() {
        // identify the URI and saltset on which this bulk-confirm is anchored
        // i.e. the selected item that is being matched to all listed items in the other set
        var anchoruri;
        var target;
        var leftright;
        var confStatus = "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch";
        // user only sees this button if exactly one side has a selection
        if($('#leftSelected').html()) { 
            anchoruri = $('.leftHighlight').attr("title") || $('.matchReference').attr('title');
            leftright = "left";
            target = "right";
        } else { 
            anchoruri = $('.rightHighlight').attr("title") || $('.matchReference').attr('title');
            leftright = "right";
            target = "left";
        }

        var confMsg = "Bulk-Confirming match between " + $('#'+leftright+'Selected').html() + 
        " in the " + leftright + "-hand list and " + $("#" + target + " .scrollitem").not(".unlisted").length
        + " active items in the " + target + "-hand list. If you are sure, "+
        "please enter a reason below.";
        var confReason = prompt(confMsg);
        if(confReason != null) { 
            // generate matches between the anchor item and each target item
            var bulkMatches = $.map($("#"+target+" .scrollitem").not(".unlisted"), 
                    function(targetItem) {
                        var targeturi = $(targetItem).attr("title") ;
                        var aligneduri = "http://slobr.linkedmusic.org/matchDecision/" + uuid.v4();
                        // set up this match. Why use the longwinded syntax instead of nice JSON? 
                        // Because JavaScript. See http://www.unethicalblogger.com/2008/03/21/javascript-wonks-missing-after-property-id.html
                        var thisMatch = {};
                        thisMatch["aligneduri"] =  aligneduri;
                        thisMatch[leftright+"uri"] = anchoruri; 
                        thisMatch[target+"uri"] = targeturi; 
                        thisMatch[leftright+"label"] = $('#' + leftright + 'Selected').html(); 
                        thisMatch[target+"label"] = $(targetItem).find('span').html(); 
                        thisMatch["confReason"] = confReason;

                        // remember each match locally
                        localStoreConfirmDispute(thisMatch, confStatus);
                        return thisMatch;
                    });
            socket.emit('bulkConfirmEvent', {matches: bulkMatches, confStatus: confStatus, confReason: confReason, timestamp: Date.now().toString(), user:userid});
        }
    });

    $('#singleConfirmDispute i').click(function(e) { 
        var confStatus;
        var confMsg;
        var confReason = prompt($('#leftSelected').html() + " :: " + $('#rightSelected').html() + "\nPlease enter a reason below.");
        var element = e.target;
        if(confReason != null) { 
            // indicate that we're talking to the server and waiting for a response
            if ($(element).hasClass("fa-thumbs-up")) {
                confStatus = "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch";
                confMsg = "Confirm match: ";
                $(element).removeClass("fa-thumbs-up").addClass("fa-cog fa-spin");

            } else { 
                confStatus = "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch";
                confMsg = "Dispute match: ";
                $(element).removeClass("fa-thumbs-down").addClass("fa-cog fa-spin");
            }// generate the aligned uri (based on left uri + right uri)

            var lefturi = $('.leftHighlight, .matchReference').attr("title");
            var righturi = $('.rightHighlight, .matchReference').attr("title");
            var aligneduri = "http://slobr.linkedmusic.org/matchDecision/" + uuid.v4()

            // remember this decision locally
            var thisMatch = {
                matchuri: aligneduri, 
                lefturi: lefturi, 
                righturi:righturi, 
                leftlabel:$('#leftSelected').html(), 
                rightlabel:$('#rightSelected').html(), 
                confReason:confReason
            };
            console.log("Reason was " + thisMatch["confReason"]);
            localStoreConfirmDispute(thisMatch, confStatus);

            // and send this decision to the server, for persistent storage
            socket.emit('confirmDisputeEvent', {confStatus: confStatus, lefturi: lefturi, righturi: righturi, aligneduri: aligneduri, confReason: confReason, timestamp: Date.now().toString(), user:userid});
        }
    });

    $('#rowwiseConfirm i').click(function(e) { 
        var leftitems = $("#left .scrollitem");
        var rightitems = $("#right .scrollitem");
        var confReason = prompt("About to perform a row-wise bulk confirmation of all rows that do not contain unlisted items on either side.\nPlease enter a reason below.");
        var confRows = [];
        var confStatus = "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch"; // TODO in future, also allow row-wise disputes?
        if(confReason != null) { 
            for (var i = 0; i < leftitems.length; i++) { 
                // for each index, confirm a match between both sides at that index
                // but only if neither side is unlisted
                // this is only called in matching modes, so we know that the index can be shared safely
                if($(leftitems[i]).hasClass("unlisted") || $(rightitems[i]).hasClass("unlisted")) { 
                    // at least one side unlisted; skip this row
                    continue;
                }
                var lefturi = $(leftitems[i]).attr("title");
                var righturi = $(rightitems[i]).attr("title");
                var leftlabel = $(leftitems[i]).children("span").html();
                var rightlabel = $(rightitems[i]).children("span").html();
                var aligneduri = "http://slobr.linkedmusic.org/matchDecision/" + uuid.v4();
                var thisMatch = {
                    matchuri: aligneduri,
                    lefturi: lefturi,
                    righturi: righturi,
                    leftlabel: leftlabel,
                    rightlabel: rightlabel,
                    confReason:confReason,
                    confStatus:confStatus
                }
                confRows.push(thisMatch);
            }
            // send off list of matching rows to the server for persistent storage
            socket.emit('rowwiseConfirmEvent', {confStatus: confStatus, confRows:confRows, confReason: confReason, timestamp: Date.now().toString(), user:userid});
            // also remember each row locally:
            for(var i = 0; i < confRows.length; i++) { 
                localStoreConfirmDispute(confRows[i], confStatus); // remember decision locally
            }
            console.log(confRows);
        }
    });
}       

function localStoreConfirmDispute(match, confStatus) {
    console.log("Locally storing ", match);
    if(fuzz[confStatus] !== undefined) { 
        fuzz[confStatus].push(match);
    } else { 
        fuzz[confStatus] = [match];
    }
}

function handleScoreDisplay() { 
    $('#selectedScore').html('');
    // now grab the left and right selected
    var leftSel = $('#leftSelected').html();
    var rightSel = $('#rightSelected').html();
    if(leftSel && rightSel) { 
        // both sides have a selection
        // see if we have it in our bag
        var mA = $("#modeSelector").val();
        for(var match in fuzz[mA])  {
            if(fuzz[mA][match]["leftlabel"] === leftSel && 
                    fuzz[mA][match]["rightlabel"] === rightSel) { 
                        if(mA === "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch" || mA === "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch") { 
                            $('#selectedScore').html(fuzz[mA][match]["confReason"])
                        } else { 
                            $('#selectedScore').html(fuzz[mA][match]["score"]);
                        }
                        break;
                    }
        }
    }
}


function handleLocks() { 
    $('.lock').toggleClass('lockActive');
    $('#scores').toggleClass('hiddenScores');
    if ($('#lockcentre').hasClass("lockActive")) {
        $('#lockcentre').html('<i class="fa fa-lock fa-2x"></i>')
    } else {
        $('#lockcentre').html('<i class="fa fa-unlock-alt fa-2x"></i>')
    }
}

function handleScrolling() { 
    $('.scrollable').on('scroll', function() { 
        if($('#lockcentre').hasClass("lockActive")) {
            //need to synchronize scrolling across both lists
            var top = $(this).scrollTop();
            $('.scrollable').scrollTop(top);
        }
        // now that we have moved scroll bar, check on context hints
        handleContextHints();   

    });
}

function handleContextHints() { 
    // context hinting logic:
    // if any context matches exist below or above the current scroll view, show the arrow hints
    // otherwise, hide them
    var topLeftContextMatch = $("#left .scrollitem.contextMatch:not(.unlisted)").first();
    var bottomLeftContextMatch = $("#left .scrollitem.contextMatch:not(.unlisted)").last();
    var topRightContextMatch = $("#right .scrollitem.contextMatch:not(.unlisted)").first();
    var bottomRightContextMatch = $("#right .scrollitem.contextMatch:not(.unlisted)").last();
    //TODO yuck - refactor
    if($(topLeftContextMatch).length && $(topLeftContextMatch).position().top + parseFloat($(topLeftContextMatch).css("font-size")) < 0) { 
        $("#leftContextHints .contextHintUp").fadeIn(duration=100);
    } else { 
        $("#leftContextHints .contextHintUp").fadeOut(duration=100);
    }
    if($(bottomLeftContextMatch).length && $(bottomLeftContextMatch).position().top > 400) { 
        $("#leftContextHints .contextHintDown").fadeIn(duration=100);
    } else { 
        $("#leftContextHints .contextHintDown").fadeOut(duration=100);
    }
    if($(topRightContextMatch).length && $(topRightContextMatch).position().top + parseFloat($(topRightContextMatch).css("font-size")) < 0) { 
        $("#rightContextHints .contextHintUp").fadeIn(duration=100);
    } else { 
        $("#rightContextHints .contextHintUp").fadeOut(duration=100);
    }
    if($(bottomRightContextMatch).length && $(bottomRightContextMatch).position().top > 400) { 
        $("#rightContextHints .contextHintDown").fadeIn(duration=100);
    } else { 
        $("#rightContextHints .contextHintDown").fadeOut(duration=100);
    }
}

function scrollLock(leftright) {
    // set the scroll location of leftright to that of the reference (i.e. the other one)
    var reference = (leftright === "left") ? "right" : "left";
    $('#' + leftright).scrollTop($('#' + reference).scrollTop());
}

function refreshLists(contextFilter) {
    // in case this takes a while... (should be speedy though)
    $('#loadingIndicator').css("display", "block");
    $('#interfaceWrapper').css("display", "none");
    // ... toggle again when we're finished
    // Store the search string as a regex if it exists
    var searchString = $("#searchbox").val();
    var searchRE;
    if(searchString !== "") {
        searchRE = new RegExp(searchString);
        // show waiting icon to indicate that the search is in progress:
        $("#search i").removeClass("fa-search").addClass("fa-cog fa-spin");
    }
    var searchMode = $('#search input[type="radio"]:checked').val();
    // Get rid of any previous selections...
    $('#leftSelected').html('');
    $('#rightSelected').html('');
    $('#selectedScore').html('');
    $("#leftContext").html('');
    $("#rightContext").html('');
    $('#confDispMsg').html('');
    $('#systemMessages').css("display", "none");
    $('#singleConfirmDispute').css("display", "none");
    $('#bulkConfirm').css("display", "none");
    $('#rowwiseConfirm').css("display", "none");
    $(".contextHintUp").css("display", "none");
    $(".contextHintDown").css("display", "none");
    // ... and adjust style depending on mode.
    modalAdjust();
    // Get the match algorithm (mode) from the selection list
    var mA = $("#modeSelector").val();
    var mode;
    if(mA === "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch" || mA === "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch") {
        mode = "displayDecisions";
    }
    else if (mA == "http://slobr.linkedmusic.org/matchAlgorithm/simpleList") { 
        mode = "simpleList";
    }
    else { 
        mode = "match";
    }
    // Grab the lists (so we don't have to keep searching the DOM every time):
    var leftList = $("#left");
    var rightList = $("#right");
    var scores = $("#scores");
    // Clear the lists:
    leftList.html("");
    rightList.html("");
    scores.html("");
    // Loop through the relevant part of the fuzz object
    var newLeftHTML = "";
    var newRightHTML = "";
    var newScoresHTML = "";
    var alternate = 1; // used for alternating stripe effect in display decisions view
    var altString;
    if(typeof fuzz !== "undefined") { 
        for (var match in fuzz[mA]) { 
            alternate *= -1;
            if(alternate>0 && mode === "displayDecisions") { 
                altString = " alternate";
            } else {
                altString = "";
            }
            // Populate the left and right list with URIs and labels from the fuzz object
            // Only include if not filtered out by contextFilter, and (no search is specified; or the search is being performed on
            // the other side (leftright); or the regex matches)
            if(typeof fuzz[mA][match]["lefturi"] !== 'undefined') {
                if((typeof(contextFilter) === "undefined" || $.inArray(fuzz[mA][match]["lefturi"], contextFilter) >= 0) &&  
                   (typeof(searchRE) === "undefined" || searchMode === "Right" || searchRE.test(fuzz[mA][match]["leftlabel"]))) { 
                    newLeftHTML += '<div class="scrollitem'+ altString + 
                        '" title="' + fuzz[mA][match]["lefturi"] + '"><span>' + fuzz[mA][match]["leftlabel"] + '</span> <i class="fa fa-eye-slash" onclick="toggleListExclusion(this)"></i><i class="fa fa-check"></i></div>\n';
                } else if(mode !== "simpleList") { 
                    // if we are in any mode where left matches right (i.e. anything but simpleList)...
                    // ...continue on to next match set and print nothing on either side for this one
                    continue;
                }
            }
            if(typeof fuzz[mA][match]["righturi"] !== 'undefined') { 
                if((typeof(contextFilter) === "undefined" || $.inArray(fuzz[mA][match]["righturi"], contextFilter) >= 0) &&  
                   (typeof(searchRE) === "undefined" || searchMode === "Left" || searchRE.test(fuzz[mA][match]["rightlabel"]))) { 
                    newRightHTML += '<div class="scrollitem' + altString +
                        '" title="' + fuzz[mA][match]["righturi"] + '"><span>' + fuzz[mA][match]["rightlabel"] + '</span> <i class="fa fa-eye-slash" onclick="toggleListExclusion(this)"></i><i class="fa fa-check"></i></div>\n';
                } else if (mode !== "simpleList") { 
                    // see above (for left label)
                    continue;
                }
            }   
            if(mode === "displayDecisions") {
                newScoresHTML += '<div class="scrollitem'+altString+'" title="'+ fuzz[mA][match]["confReason"] + '">' + fuzz[mA][match]["confReason"] + '&nbsp;</div>\n';
            } else {
                newScoresHTML += '<div class="scrollitem">' + fuzz[mA][match]["score"] + '</div>\n';
            }
        }
    }
    leftList.html(newLeftHTML);
    rightList.html(newRightHTML);
    scores.html(newScoresHTML);
    handleHighlights();
    if(mode !== "displayDecisions") { 
        // visually indicate any items on either side that have been included in at least one match decision previously
        indicateAlreadyConfirmedDisputedItems();
    }
    if(mode === 'match') { 
        // visually indicate any rows that have already been confirmed / disputed previously
        indicateAlreadyConfirmedDisputedRows();
        // and enable rowwise confirm
        $("#rowwiseConfirm").css("display", "inline");
    }
    if(searchString !== "") {
        // we're done; change icon back from "waiting" to "search"
        $("#search i").removeClass("fa-cog fa-spin").addClass("fa-search");
    }
    $('#loadingIndicator').css("display", "none");
    $('#interfaceWrapper').css("display", "block");
}
function getConfDispMsg() { 
    // return a string indicating if a highlighted match already has been confirmed and/or disputed
    // TODO refactor with the below function to reduce redundancy
    var confDispMsg = "";
    var lefturi = $(".leftHighlight").attr("title");
    var righturi = $(".rightHighlight").attr("title");
    if(lefturi && righturi) {
        var confirmed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch"] || new Array(); 
        var disputed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch"] || new Array(); 
        var confirmedMatches = confirmed.map(function(x) { return x["rowlookup"] });
        var disputedMatches = disputed.map(function(x) { return x["rowlookup"] });
        var rowlookup = lefturi + "|" + righturi;
        if(confirmedMatches.indexOf(rowlookup) > -1 && disputedMatches.indexOf(rowlookup) > -1) { 
            confDispMsg = "This match has already been confirmed AND disputed.";
        } else if(confirmedMatches.indexOf(rowlookup) > -1) { 
            confDispMsg = "This match has already been confirmed.";
        } else if(disputedMatches.indexOf(rowlookup) > -1) { 
            confDispMsg = "This match has already been disputed.";
        }
        return confDispMsg;
    }
}

function indicateAlreadyConfirmedDisputedItems() { 
    // called in all modes except displayDecisions
    // visually indicate whether a given item on either list has been included in at least one match decision previously
    allItems = $.merge($("#left .scrollitem"), $("#right .scrollitem"));
    var confirmed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch"] || new Array(); 
    var disputed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch"] || new Array(); 
    var decisioned = confirmed.concat(disputed);
    var decisionedItems = [];
    for(var d = 0; d < decisioned.length; d++) { 
        if(typeof(decisioned[d]) !== "undefined")  {
            decisionedItems.push(decisioned[d]["lefturi"]);
            decisionedItems.push(decisioned[d]["righturi"]);
        }
    }
    for (var i = 0; i < allItems.length; i++) { 
        if(decisionedItems.indexOf($(allItems[i]).attr("title")) > -1) { 
            $(allItems[i]).find(".fa-check").css("visibility", "visible");
        }
    }
}
    

function indicateAlreadyConfirmedDisputedRows() { 
    // only called in matching modes
    // visually indicate whether a given row has already been confirmed / disputed
    // TODO refactor with the above function to reduce redundancy
    var leftItems = $("#left .scrollitem");
    var rightItems = $("#right .scrollitem");
    var confirmed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch"] || new Array(); 
    var disputed = fuzz["http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch"] || new Array(); 
    var confirmedMatches = confirmed.map(function(x) { return x["rowlookup"] });
    var disputedMatches = disputed.map(function(x) { return x["rowlookup"] });
    
    for (var i = 0; i < leftItems.length; i++) {
        var lefturi = $(leftItems[i]).attr("title");
        var righturi = $(rightItems[i]).attr("title");
        var rowlookup = lefturi + "|" + righturi;
        var found=false;
        if(confirmedMatches.indexOf(rowlookup) > -1) { 
            $(leftItems[i]).addClass("confirmed");
            $(leftItems[i]).children("span").after('<i class="fa fa-thumbs-up">');
            $(rightItems[i]).addClass("confirmed");
            $(rightItems[i]).children("span").after('<i class="fa fa-thumbs-up">');
            found=true;
        }

        if(disputedMatches.indexOf(rowlookup) > -1) { 
            $(leftItems[i]).addClass("disputed");
            $(leftItems[i]).children("span").after('<i class="fa fa-thumbs-down">');
            $(rightItems[i]).addClass("disputed");
            $(rightItems[i]).children("span").after('<i class="fa fa-thumbs-down">');
            found=true;
        }
        if(found) {
            toggleListExclusion($(leftItems[i]).children(".fa-eye, .fa-eye-slash"));
            toggleListExclusion($(rightItems[i]).children(".fa-eye, .fa-eye-slash"));
        }
    }

}

function loadMatchesForSelected(leftright, selected) { 
    var target = (leftright === "left") ? "right" : "left";
    // user has double clicked on a name (on the left or right)
    // populate the left/rightSelected div appropriately
    $('#' + leftright +'Selected').html(selected.html());
    $('#' + target + 'Selected').html("");
    $('#selectedScore').html("");
    // load up all matches to that name on the other list
    var mA = $("#modeSelector").val();
    var sourceList = $("#" + leftright);
    var targetList = $("#" + target);
    var scoresList = $("#scores");
    // clear target list
    targetList.html("");
    var newTargetHTML = "";
    var newScoresHTML = "";
    for (var match in fuzz[mA]) { 
        // re-populate target list with items matching dblclicked name 
        if(fuzz[mA][match][leftright+"label"] === selected.html()) {
            newTargetHTML += '<div class="scrollitem" title="' + fuzz[mA][match][target+"uri"] + 
                '"><span>' + fuzz[mA][match][target+"label"] + '</span> <i class="fa fa-eye-slash" onclick="toggleListExclusion(this)"></i></div>\n';
            newScoresHTML += '<div class="scrollitem">' + fuzz[mA][match]["score"] + '</div>\n';
        }
    }
    scoresList.html(newScoresHTML);
    targetList.html(newTargetHTML);

    // since we cleared all the scrollitems in the target list before loading matches,
    // need to reinitialize highlighting (i.e. click handlers) there
    handleHighlight(target); 

}

function toggleListExclusion(element) { 
    if($(element).hasClass("fa-eye-slash")) { 
        // unlist this item
        $(element).removeClass("fa-eye-slash");
        $(element).addClass("fa-eye");
        $(element).parent().addClass("unlisted");
    } else { 
        // relist this item
        $(element).removeClass("fa-eye");
        $(element).addClass("fa-eye-slash");
        $(element).parent().removeClass("unlisted");
    }
}

function modalAdjust() {  
    // Adjust various things depending on mode
    // (simple list mode, matching mode, or review confirmations / disputations mode)
    // * Adjust width of score/confReason column
    // * Show or hide lock controls and confirmation panel
    // * Deactivate left / right search when not in simple list mode

    // By default, only allow searches on both lists at once
    var radioButtons = $("#search input");
    $(radioButtons[1]).attr("disabled", "disabled"); // left
    $(radioButtons[2]).attr("disabled", "disabled"); // right

    var mA = $('#modeSelector').val();
    if(mA === "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch" || mA === "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch") {  
        $('#scores').css("width", "370px");
        $('#scores').css("display", "block");
        $('.lockcontrols').css('visibility', 'hidden');
        // always lock scrolling in display-decisions mode
        if(!($('#lockcentre').hasClass('lockActive'))) { 
            handleLocks();
        }
        $(radioButtons[3]).prop("checked", true); // make sure Both is selected
    }
    else if (mA === "http://slobr.linkedmusic.org/matchAlgorithm/simpleList") { 
        // no scores to display on an unmatched simple listing...
        $('#scores').css("display", "none");
        // since the lists aren't matched, locked scrolling makes no sense in this mode
        $('.lockcontrols').css('visibility', 'hidden');
        if($('#lockcentre').hasClass('lockActive')) { 
            handleLocks();
        }
        // allow searches on left only / right only
        $("#search input").removeAttr("disabled");
    }
    else { 
        $('#scores').css("width", "50px");
        $('#scores').css("display", "block");
        $('.lockcontrols').css('visibility', 'visible');
        // start with locked scrolling in match modes
        if(!($('#lockcentre').hasClass('lockActive'))) { 
            handleLocks();
        }
        $(radioButtons[3]).prop("checked", true); // make sure Both is selected
        // don't reveal confirm panel since it should only show after user selects an item on each side
    }

}

function handleContext(uri, leftright) {
    source = leftright === "left" ? "saltsetAContext" : "saltsetBContext";
    target = leftright === "left" ? "saltsetBContext" : "saltsetAContext";
    targetDirection = leftright === "left" ? "right" : "left";
    var contextElement = $("#" + leftright  + "Context");
    var newContextHTML = "";
    $("#"+targetDirection+" .scrollitem.contextMatch").removeClass("contextMatch")

    // create divs to display in context view for any context items we find
    var varNameInstances = {}; // keep count of variables we need to create divs for
    var contextItems = fuzz[source][uri];
    if(typeof(contextItems) !== "undefined") {  // allow for context sparql to return nothing
        for (var contextVar in Object.keys(contextItems)) {
            var varName = Object.keys(contextItems)[contextVar]; 
            if (!(varName in varNameInstances)) { 
                varNameInstances[varName] = 1;
                // create the div
                newContextHTML += '<div class="contextVar ' + varName + '">' + '<span class="contextVarHeader" onclick="expandContextItems(this)">' + '<i class="fa fa-plus-square-o"></i> <span class="numContextItems"></span> <span class="contextVarName">' + varName + '</span></span></div>\n';
            } else { 
                // div already create
                varNameInstances[varName]++;
            }
        }
        // add the new divs to the DOM
        contextElement.html(newContextHTML);

        // now populate the divs
        for (var contextVar in Object.keys(contextItems)) {
            var varName = Object.keys(contextItems)[contextVar]; 
            var prevContent = $("#" + leftright + "Context .contextVar." + varName).html();
            var newContent = "";
            for (var item in fuzz[source][uri][varName]) {
                contextMatches = findContextMatches(fuzz[source][uri][varName][item]["value"], leftright);
                var numContextMatchesSpan = "";
                if(contextMatches.length > 0) { 
                    numContextMatchesSpan = ' <span class="numContextMatches"><i class="fa fa-star"></i> '+contextMatches.length + '</span>';
                }
                var itemTypeIndicator = fuzz[source][uri][varName][item]["type"] === "uri" ? "fa-link" : "fa-terminal";
                newContent += '<div class="contextItem"><i class="fa ' + itemTypeIndicator + '"></i> ' + '<span class="contextItemContent">' + 
                    fuzz[source][uri][varName][item]["value"] + '</span> ' + numContextMatchesSpan + '</div>';
            }
            $("#" + leftright + "Context  .contextVar." + varName).html(prevContent + newContent);

            var instanceCount = $("#" + leftright + "Context  .contextVar." + varName + " .contextItem").length
                $("#" + leftright + "Context  .contextVar." + varName + " .numContextItems").html(instanceCount);

        }

        // make any context items with context matches clickable...
        $("#" + leftright + "Context .contextItem").has(".numContextMatches").click(function() { 
                filterListsByContext($(this).find(".contextItemContent").html());
        });
        // adjust the cursor to hint at clickability...
        $("#" + leftright + "Context .contextItem").has(".numContextMatches").css("cursor","pointer");
        // and signify in the context var header that there are matches available here
        $("#" + leftright + "Context .contextVar").has(".numContextMatches").addClass("containsMatches");
        // default to expanding those with matches
        expandContextItems($("#" + leftright + "Context .contextVar.containsMatches .contextVarHeader"));
        
        // highlight any context matches in the opposite list...
        revealAnyContextMatches(leftright); 

        // and hint up or down if any context matches are scrolled off the visible part of the list
        handleContextHints();

    }
}

function filterListsByContext(contextString) { 
    contextMatches = findContextMatches(contextString, "left").concat(findContextMatches(contextString, "right"));
    console.log("context matches: ", contextMatches);
    var modeChanged = false;
    if (modeType() !== "simpleList") { 
       changeMode("http://slobr.linkedmusic.org/matchAlgorithm/simpleList");
       modeChanged = true;
    } 
    refreshLists(contextMatches);
    if(modeChanged) { 
        $('#systemMessages').html("<i class='fa fa-exchange'></i> Mode changed to " + $('#modeSelector option:selected').text()).fadeIn("200")
    }
}

function expandContextItems(thisItem) { 
    if($(thisItem).find("i").hasClass("fa-plus-square-o")) {
        // we need to expand the items
        $(thisItem).siblings(".contextItem").slideDown("fast");
        // and change the icon to afford contracting rather than expanding
        $(thisItem).find("i").removeClass("fa-plus-square-o");
        $(thisItem).find("i").addClass("fa-minus-square-o");
    } else { 
        // we need to contract the items
        $(thisItem).siblings(".contextItem").slideUp("fast");
        // and change the icon to afford expanding rather than contracting 
        $(thisItem).find("i").removeClass("fa-minus-square-o");
        $(thisItem).find("i").addClass("fa-plus-square-o");
    }
}

function revealAnyContextMatches(leftright) { 
    var target = leftright === "left" ? "right" : "left";
    var sharedContextURIs = new Array();
    contextVars = $('#' + leftright + 'Context .contextVar.containsMatches .contextItemContent');
    for (var contextVar = 0; contextVar < contextVars.length; contextVar++) { 
        contextMatches = findContextMatches($(contextVars[contextVar]).html(), leftright);
        for (var c = 0; c < contextMatches.length; c++) { 
            sharedContextURIs.push(contextMatches[c]);
        }
    }
    for(var uri in sharedContextURIs) { 
        $('#'+target+' .scrollitem[title="' + sharedContextURIs[uri] + '"]').addClass("contextMatch");
    }
}

function findContextMatches(contextString, leftright) { 
    var target = leftright === "left" ? "saltsetBContext" : "saltsetAContext";
    var sharedContextURIs = [];
    for (var item in fuzz[target]) { 
        for (var param in fuzz[target][item]) {
            for (var entry in fuzz[target][item][param]) {
                if(fuzz[target][item][param][entry]["value"] === contextString) { 
                    sharedContextURIs.push(fuzz[target][item]["uri"][0]["value"]);
                }
            }
        }
    }
    return(sharedContextURIs);
}


function modeType() { 
    //TODO refactor code to use this
    var modeType;
    var mA = $('#modeSelector').val();
    if(mA === "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch" || mA === "http://slobr.linkedmusic.org/matchAlgorithm/disputedMatch") {  
        modeType = "confirmDispute";
    }
    else if (mA === "http://slobr.linkedmusic.org/matchAlgorithm/simpleList") { 
        modeType = "simpleList";
    }
    else { 
        modeType = "matching";
    }
    
    return modeType;
}

function changeMode(newMode) { 
    $('#modeSelector').val(newMode);
    modalAdjust();
}


$(document).ready(function() { 
    // set up websocket
    socket=io.connect('http://' + document.domain + ':' + location.port); 
    socket.on('connect', function() { 
        socket.emit('clientConnectionEvent', 'Client connected.');
        console.log("Connected to server");
    });

    // set up websocket handlers
    socket.on('confirmDisputeHandled', function(msg) {
        console.log("confirmDisputeHandled: ", msg);
        var mA = $('#modeSelector').val();
        if(msg["confStatus"] === "http://slobr.linkedmusic.org/matchAlgorithm/confirmedMatch") {
            $("#confirmMatch i").removeClass("fa-cog fa-spin").addClass("fa-thumbs-up");
            if(modeType() === "matching") {
                $('.scrollitem[title="' + msg['lefturi'] + '"]').addClass('confirmed');
                $('.scrollitem[title="' + msg['lefturi'] + '"]').children("span").after('<i class="fa fa-thumbs-up">');
                $('.scrollitem[title="' + msg['righturi'] + '"]').addClass('confirmed');
                $('.scrollitem[title="' + msg['righturi'] + '"]').children("span").after('<i class="fa fa-thumbs-up">');
            }
        } else { 
            $("#disputeMatch i").removeClass("fa-cog fa-spin").addClass("fa-thumbs-down");
            if(modeType() === "matching") { 
                $('.scrollitem[title="' + msg['lefturi'] + '"]').addClass('disputed');
                $('.scrollitem[title="' + msg['lefturi'] + '"]').children("span").after('<i class="fa fa-thumbs-down">');
                $('.scrollitem[title="' + msg['righturi'] + '"]').addClass('disputed');
                $('.scrollitem[title="' + msg['righturi'] + '"]').children("span").after('<i class="fa fa-thumbs-down">');
            }
        }
        indicateAlreadyConfirmedDisputedItems();
    });

    socket.on('bulkConfirmHandled', function(msg) {
        console.log("Bulk confirm handled: ", msg);
        indicateAlreadyConfirmedDisputedItems();
    });

    socket.on('rowwiseConfirmHandled', function(msg) { 
        console.log("Row-wise confirm handled: ", msg);
        indicateAlreadyConfirmedDisputedItems();
    });

    $(document).click(function(e) { 
        // hide any messages on click anywhere but on the triggering contextitem)
        if(!$(e.target).parents().hasClass("contextItem")){
            $('#systemMessages').fadeOut("fast");
        }
    });

    // initialize stuff
    populateSaltsetIndicators(); handleLocks(); handleScrolling(); refreshLists(); handleConfirmDispute(); 
});
