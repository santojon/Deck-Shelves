"""Tests for library_location.py — VDF parsing, library categorization, and
the app->library map, all fail-soft and never raising."""
import library_location as ll

SAMPLE_VDF = '''
"libraryfolders"
{
	"0"
	{
		"path"		"__INTERNAL__"
		"label"		""
		"contentid"		"1111"
		"apps"
		{
			"228980"		"394331343"
		}
	}
	"1"
	{
		"path"		"__EXTERNAL__"
		"label"		"SD Card"
		"contentid"		"2222"
		"apps"
		{
			"99999"		"1000000"
			"88888"		"2000000"
		}
	}
}
'''


def test_parse_vdf_builds_nested_tree():
    tree = ll._parse_vdf(SAMPLE_VDF)
    lib0 = tree["libraryfolders"]["0"]
    assert lib0["path"] == "__INTERNAL__"
    assert lib0["contentid"] == "1111"
    assert lib0["apps"] == {"228980": "394331343"}


def test_parse_vdf_handles_malformed_input_without_raising():
    assert ll._parse_vdf("not valid vdf at all { } } {") is not None
    assert ll._parse_vdf("") == {}


def test_find_libraryfolders_vdf_returns_none_when_absent(monkeypatch):
    monkeypatch.setattr(ll, "_steam_install_candidates", lambda: ["/does/not/exist"])
    assert ll._find_libraryfolders_vdf() is None


def test_get_library_locations_unsupported_when_vdf_missing(monkeypatch):
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: None)
    result = ll.get_library_locations()
    assert result == {"libraries": [], "appLibrary": {}, "supported": False}


def test_get_library_locations_parses_libraries_and_app_map(tmp_path, monkeypatch):
    internal = tmp_path / "Steam"
    external = tmp_path / "sdcard"
    internal.mkdir()
    external.mkdir()
    vdf_text = SAMPLE_VDF.replace("__INTERNAL__", str(internal)).replace("__EXTERNAL__", str(external))
    vdf_path = internal / "steamapps" / "libraryfolders.vdf"
    vdf_path.parent.mkdir(parents=True)
    vdf_path.write_text(vdf_text)
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: str(vdf_path))
    monkeypatch.setattr(ll, "_mount_fstype", lambda path: "")

    result = ll.get_library_locations()

    assert result["supported"] is True
    by_id = {lib["id"]: lib for lib in result["libraries"]}
    assert by_id["1111"]["category"] == "internal"
    assert by_id["1111"]["mounted"] is True
    assert by_id["2222"]["category"] == "external"
    assert by_id["2222"]["label"] == "SD Card"
    assert result["appLibrary"] == {"228980": "1111", "99999": "2222", "88888": "2222"}


def test_get_library_locations_marks_unmounted_libraries(tmp_path, monkeypatch):
    internal = tmp_path / "Steam"
    internal.mkdir()
    missing = tmp_path / "gone"
    vdf_text = SAMPLE_VDF.replace("__INTERNAL__", str(internal)).replace("__EXTERNAL__", str(missing))
    vdf_path = internal / "steamapps" / "libraryfolders.vdf"
    vdf_path.parent.mkdir(parents=True)
    vdf_path.write_text(vdf_text)
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: str(vdf_path))
    monkeypatch.setattr(ll, "_mount_fstype", lambda path: "")

    result = ll.get_library_locations()

    by_id = {lib["id"]: lib for lib in result["libraries"]}
    assert by_id["2222"]["mounted"] is False


def test_categorize_network_mount(monkeypatch):
    monkeypatch.setattr(ll, "_mount_fstype", lambda path: "nfs4")
    assert ll._categorize("/mnt/nas", "/home/deck/.local/share/Steam") == "network"


def test_mount_fstype_reads_proc_mounts_format(tmp_path):
    mounts = tmp_path / "mounts"
    mounts.write_text(
        "/dev/sda1 / ext4 rw 0 0\n"
        "nas:/games /mnt/nas nfs4 rw 0 0\n"
    )
    assert ll._mount_fstype("/mnt/nas/some/game", mounts_file=str(mounts)) == "nfs4"
    assert ll._mount_fstype("/unrelated/path", mounts_file=str(mounts)) == "ext4"


def test_get_library_locations_never_raises_on_unreadable_vdf(monkeypatch):
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: "/does/not/exist/libraryfolders.vdf")
    assert ll.get_library_locations() == {"libraries": [], "appLibrary": {}, "supported": False}


def test_mount_entry_returns_the_source_device(tmp_path):
    mounts = tmp_path / "mounts"
    mounts.write_text("/dev/nvme0n1p8 / ext4 rw 0 0\n/dev/mmcblk0p1 /run/media/deck/abc ext4 rw 0 0\n")
    assert ll._mount_entry("/run/media/deck/abc/steamapps", mounts_file=str(mounts)) == ("/dev/mmcblk0p1", "ext4")


def test_sd_card_is_the_mmc_block_device():
    assert ll._is_sd_card("/dev/mmcblk0p1") is True
    assert ll._is_sd_card("/dev/sda1") is False
    assert ll._is_sd_card("") is False


def test_volume_label_only_reads_device_paths(tmp_path):
    dev = tmp_path / "mmcblk0p1"
    dev.write_text("")
    labels = tmp_path / "by-label"
    labels.mkdir()
    (labels / "Game\\x20Card").symlink_to(dev)
    assert ll._volume_label(str(dev), labels_dir=str(labels)) == ""
    assert ll._volume_label("/dev/none", labels_dir=str(labels)) == ""


def test_volume_label_matches_a_device_path(tmp_path, monkeypatch):
    labels = tmp_path / "by-label"
    labels.mkdir()
    target = tmp_path / "dev-node"
    target.write_text("")
    (labels / "Game\\x20Card").symlink_to(target)
    real = ll.os.path.realpath
    monkeypatch.setattr(ll.os.path, "realpath", lambda p: real(str(target)) if p == "/dev/mmcblk0p1" else real(p))
    assert ll._volume_label("/dev/mmcblk0p1", labels_dir=str(labels)) == "Game Card"


def test_library_without_label_is_not_named(tmp_path, monkeypatch):
    internal = tmp_path / "Steam"
    card = tmp_path / "842f2ed3-0000"
    internal.mkdir()
    card.mkdir()
    vdf_text = SAMPLE_VDF.replace("__INTERNAL__", str(internal)).replace("__EXTERNAL__", str(card)).replace('"SD Card"', '""')
    vdf_path = internal / "steamapps" / "libraryfolders.vdf"
    vdf_path.parent.mkdir(parents=True)
    vdf_path.write_text(vdf_text)
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: str(vdf_path))
    monkeypatch.setattr(ll, "_mount_fstype", lambda path: "")
    monkeypatch.setattr(ll, "_mount_entry", lambda path: ("/dev/mmcblk0p1", "ext4") if path == str(card) else ("/dev/nvme0n1p8", "ext4"))
    monkeypatch.setattr(ll, "_volume_label", lambda source: "")
    by_id = {lib["id"]: lib for lib in ll.get_library_locations()["libraries"]}
    assert by_id["2222"]["label"] == "842f2ed3-0000"
    assert by_id["2222"]["named"] is False
    assert by_id["2222"]["sdCard"] is True
    assert by_id["1111"]["sdCard"] is False


def test_internal_library_keeps_its_folder_name_over_the_volume_label(tmp_path, monkeypatch):
    internal = tmp_path / "Steam"
    internal.mkdir()
    vdf_text = SAMPLE_VDF.replace("__INTERNAL__", str(internal)).replace("__EXTERNAL__", str(tmp_path / "gone"))
    vdf_path = internal / "steamapps" / "libraryfolders.vdf"
    vdf_path.parent.mkdir(parents=True)
    vdf_path.write_text(vdf_text)
    monkeypatch.setattr(ll, "_find_libraryfolders_vdf", lambda: str(vdf_path))
    monkeypatch.setattr(ll, "_mount_fstype", lambda path: "")
    monkeypatch.setattr(ll, "_mount_entry", lambda path: ("/dev/nvme0n1p8", "ext4"))
    monkeypatch.setattr(ll, "_volume_label", lambda source: "home")
    by_id = {lib["id"]: lib for lib in ll.get_library_locations()["libraries"]}
    assert by_id["1111"]["label"] == "Steam"
    assert by_id["1111"]["named"] is False
