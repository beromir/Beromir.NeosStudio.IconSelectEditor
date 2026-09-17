<?php

declare(strict_types=1);

namespace Beromir\NeosStudio\IconSelectEditor\Eel;

use Neos\Eel\ProtectedContextAwareInterface;
use Neos\Flow\Annotations as Flow;
use Neos\Flow\Package\FlowPackageInterface;
use Neos\Flow\Package\PackageManager;

class IconSelectHelper implements ProtectedContextAwareInterface
{
    #[Flow\Inject]
    protected PackageManager $packageManager;

    /** @var array<string, array<string, mixed>> */
    #[Flow\InjectConfiguration(path: 'sources', package: 'Beromir.NeosStudio.IconSelectEditor')]
    protected array $sources = [];

    #[Flow\InjectConfiguration(path: 'defaultSource', package: 'Beromir.NeosStudio.IconSelectEditor')]
    protected string $defaultSource = '';

    /**
     * Resolve a picker value against its source directory from package settings.
     * An explicit directory overrides that setting for this call. A stored
     * full resource URI passes through unchanged.
     */
    public function resourceUri(?string $value, ?string $directoryOverride = null): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (str_starts_with($value, 'resource://')) {
            return $value;
        }

        [$source, $name] = $this->splitValue($value);
        if ($name === '' || str_contains($name, '/') || str_contains($name, '\\')) {
            return '';
        }

        $source = $source !== '' ? $source : $this->defaultSource;
        $sourceConfiguration = $this->sources[$source] ?? null;
        $directory = $directoryOverride ?? (
            is_array($sourceConfiguration)
                ? ($sourceConfiguration['resourcePath'] ?? $sourceConfiguration['previewPath'] ?? '')
                : ''
        );
        if (!is_string($directory)) {
            return '';
        }
        $directory = trim($directory, '/');
        if ($directory === '') {
            return '';
        }

        return 'resource://' . $directory . '/' . $name . '.svg';
    }

    /** Whether the resolved SVG is a file inside its package's Resources folder. */
    public function exists(?string $value, ?string $directoryOverride = null): bool
    {
        $uri = $this->resourceUri($value, $directoryOverride);
        if (str_contains($uri, "\0") || preg_match('#^resource://([^/]+)/(.+\.svg)$#iD', $uri, $matches) !== 1) {
            return false;
        }
        if (!$this->packageManager->isPackageAvailable($matches[1])) {
            return false;
        }
        $package = $this->packageManager->getPackage($matches[1]);
        if (!$package instanceof FlowPackageInterface) {
            return false;
        }

        $resourcesPath = realpath($package->getResourcesPath());
        $file = realpath($package->getResourcesPath() . $matches[2]);

        return $resourcesPath !== false
            && $file !== false
            && str_starts_with($file, $resourcesPath . '/')
            && is_file($file);
    }

    public function iconName(?string $value): string
    {
        if ($value === null || $value === '') {
            return '';
        }
        if (str_starts_with($value, 'resource://')) {
            return preg_replace('/\.svg$/i', '', basename($value)) ?? '';
        }

        return $this->splitValue($value)[1];
    }

    /** The stored prefix, or the configured default source for a bare name. */
    public function sourceName(?string $value): string
    {
        if ($value === null || $value === '' || str_starts_with($value, 'resource://')) {
            return '';
        }

        [$source, $name] = $this->splitValue($value);
        return $name === '' ? '' : ($source !== '' ? $source : $this->defaultSource);
    }

    /** @return array{string, string} */
    private function splitValue(string $value): array
    {
        $separator = strpos($value, ':');
        if ($separator === false) {
            return ['', $value];
        }
        if ($separator === 0 || $separator === strlen($value) - 1 || str_contains(substr($value, $separator + 1), ':')) {
            return ['', ''];
        }

        return [substr($value, 0, $separator), substr($value, $separator + 1)];
    }

    public function allowsCallOfMethod($methodName): bool
    {
        return in_array($methodName, ['resourceUri', 'exists', 'iconName', 'sourceName'], true);
    }
}
