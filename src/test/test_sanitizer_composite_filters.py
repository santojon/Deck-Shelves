"""A multi-source shelf keeps every filter level through a settings save."""
import copy
import json

import sanitizer

DISCOUNT = {"mode": "and", "items": [{"type": "discount", "inverted": False, "params": {"minDiscount": 30}}]}
INDIE = {"mode": "and", "items": [{"type": "genres", "inverted": False, "params": {"genres": ["Indie"]}}]}
LOCAL_COOP = {"mode": "or", "items": [{"type": "categories", "inverted": True, "params": {"categories": ["Shared/Split Screen"]}}]}


def _saved_source(source):
    doc = {"enabled": True, "shelves": [{"id": "s1", "title": "Couch", "limit": 10, "source": copy.deepcopy(source)}]}
    out = sanitizer._sanitize_settings(json.loads(json.dumps(doc)))
    return json.loads(json.dumps(out))["shelves"][0]["source"]


def test_combined_result_filter_and_source_filters_survive():
    source = {
        "type": "composite",
        "combine": "union",
        "sources": [{"type": "wishlist", "childFilter": INDIE}, {"type": "store", "childFilter": DISCOUNT}],
        "postFilter": LOCAL_COOP,
    }
    assert _saved_source(source) == source


def test_old_shared_filter_survives_next_to_the_combined_result_filter():
    source = {
        "type": "composite",
        "combine": "intersection",
        "sources": [{"type": "wishlist"}, {"type": "store"}],
        "childFilter": DISCOUNT,
        "postFilter": LOCAL_COOP,
    }
    assert _saved_source(source) == source


def test_saving_twice_changes_nothing():
    source = {"type": "composite", "combine": "union", "sources": [{"type": "wishlist"}, {"type": "store"}], "postFilter": LOCAL_COOP}
    once = _saved_source(source)
    assert _saved_source(once) == once == source


def test_a_smart_mode_as_the_shelf_source_survives_alone_and_first_of_several():
    alone = {"type": "smart", "mode": "hidden_gems"}
    first = {"type": "composite", "combine": "union", "sources": [{"type": "smart", "mode": "acme.mode", "sort": "recent", "limit": 5}, {"type": "wishlist"}]}
    assert _saved_source(alone) == alone
    assert _saved_source(first) == first
