<?php

declare(strict_types=1);

namespace Beromir\NeosStudio\IconSelectEditor\Controller;

use Neos\Flow\Annotations as Flow;
use Neos\Flow\Mvc\Controller\ActionController;
use Neos\Flow\Package\FlowPackageInterface;
use Neos\Flow\Package\PackageManager;

/**
 * Lists the SVG icons of the configured icon sources.
 *
 * The classic Medienreaktor.IconSelectEditor obtains this listing through the
 * Neos UI's data source API, which the Studio plugin API does not expose - so
 * this port ships its own endpoint behind the same OAuth bearer firewall as
 * the Studio and Neos API controllers (see Settings.yaml / Policy.yaml): any
 * logged-in backend editor may query it through Studio's API client.
 *
 * Unlike the original data source, paths are resolved through the
 * PackageManager instead of assuming DistributionPackages/, so icon sources
 * inside composer-installed packages work too.
 */
class IconsController extends ActionController
{
    /**
     * The API route and Studio client both expect JSON; declaring the media
     * type explicitly prevents the base controller's HTML default from being
     * selected during content negotiation.
     *
     * @var array<string>
     */
    protected $supportedMediaTypes = ['application/json'];

    #[Flow\Inject]
    protected PackageManager $packageManager;

    /**
     * GET api/icon-select-editor/icons?sources=<json>
     *
     * `sources` is a list of `editorOptions.iconSources` entries as JSON:
     * [{"name": "Font Awesome", "path": "Vendor.Site/Private/Icons/FontAwesome/regular"}, ...]
     * The editor requests one source at a time, when its tab is shown.
     *
     * Response: {"sources": [{"name": "...", "icons": [{"label", "sourceName", "icon", "resourceUri"}, ...]}, ...]}
     * where `icon` is the SVG file's markup and `resourceUri` the stable
     * `resource://<Package>/<path>/<file>.svg` URI that gets stored on the node.
     */
    public function indexAction(string $sources = '[]'): string
    {
        $this->response->setContentType('application/json');

        try {
            $sourceConfigurations = json_decode($sources, true, 8, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            $sourceConfigurations = null;
        }
        if (!is_array($sourceConfigurations)) {
            $this->response->setStatusCode(400);
            return json_encode(['error' => 'The sources argument must be a JSON array of {name, path} objects.'], JSON_THROW_ON_ERROR);
        }

        $result = [];
        foreach ($sourceConfigurations as $configuration) {
            if (!is_array($configuration) || !isset($configuration['path']) || !is_string($configuration['path'])) {
                continue;
            }
            $path = trim($configuration['path'], '/');
            if ($path === '') {
                continue;
            }
            $name = isset($configuration['name']) && is_string($configuration['name']) && $configuration['name'] !== ''
                ? $configuration['name']
                : $path;
            $result[] = [
                'name' => $name,
                'icons' => $this->scanSource($name, $path),
            ];
        }

        return json_encode(['sources' => $result], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    /**
     * GET api/icon-select-editor/icon?resourceUri=<uri>
     *
     * A single icon by the resource URI stored on the node, so the editor can
     * preview a stored selection without loading a whole source listing.
     *
     * Response: {"icon": {"label", "icon", "resourceUri"}}, or {"icon": null}
     * when the URI does not name an SVG file inside a package's Resources
     * folder - e.g. an icon renamed after it was picked.
     */
    public function iconAction(string $resourceUri): string
    {
        $this->response->setContentType('application/json');

        $icon = null;
        if (preg_match('#^resource://([^/]+)/(.+\.svg)$#i', $resourceUri, $matches) === 1) {
            $file = $this->resolveResourcePath($matches[1], $matches[2]);
            $svg = $file !== null && is_file($file) ? file_get_contents($file) : false;
            if ($svg !== false) {
                $icon = [
                    'label' => $this->labelFromName(pathinfo($matches[2], PATHINFO_FILENAME)),
                    'icon' => $svg,
                    'resourceUri' => $resourceUri,
                ];
            }
        }

        return json_encode(['icon' => $icon], JSON_THROW_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    /**
     * The icons of one source path (`<PackageKey>/<path below Resources/>`,
     * e.g. "Vendor.Site/Private/Icons/FontAwesome/regular"). Unknown packages
     * and paths outside the package's Resources directory yield an empty list
     * rather than an error, so one broken source does not take down the whole
     * listing.
     *
     * @return list<array{label: string, sourceName: string, icon: string, resourceUri: string}>
     */
    private function scanSource(string $sourceName, string $path): array
    {
        $segments = explode('/', $path);
        $packageKey = array_shift($segments);

        $directory = $this->resolveResourcePath($packageKey, implode('/', $segments));
        if ($directory === null || !is_dir($directory)) {
            return [];
        }

        $icons = [];
        foreach (scandir($directory) as $file) {
            if (preg_match('/^(.+)\.svg$/i', $file, $matches) !== 1 || !is_file($directory . '/' . $file)) {
                continue;
            }
            $svg = file_get_contents($directory . '/' . $file);
            if ($svg === false) {
                continue;
            }
            $icons[] = [
                'label' => $this->labelFromName($matches[1]),
                'sourceName' => $sourceName,
                'icon' => $svg,
                'resourceUri' => 'resource://' . $packageKey . '/' . implode('/', [...$segments, $file]),
            ];
        }

        return $icons;
    }

    /**
     * The real path of $relativePath below a package's Resources folder, or
     * null for unknown packages, missing paths and paths leaving that folder.
     */
    private function resolveResourcePath(string $packageKey, string $relativePath): ?string
    {
        if (!$this->packageManager->isPackageAvailable($packageKey)) {
            return null;
        }
        $package = $this->packageManager->getPackage($packageKey);
        if (!$package instanceof FlowPackageInterface) {
            return null;
        }

        // realpath resolves symlinks and eliminates any ../ segments; the
        // prefix check then guarantees the path is inside the package's
        // Resources folder, whatever the request contained.
        $resourcesPath = realpath($package->getResourcesPath());
        $resolvedPath = realpath($package->getResourcesPath() . $relativePath);
        if (
            $resourcesPath === false
            || $resolvedPath === false
            || !str_starts_with($resolvedPath . '/', $resourcesPath . '/')
        ) {
            return null;
        }

        return $resolvedPath;
    }

    /**
     * The label for an icon file name without its extension. The editor's
     * labelFromResourceUri() mirrors this derivation.
     */
    private function labelFromName(string $name): string
    {
        return ucwords(str_replace(['-', '.', '_'], ' ', $name));
    }
}
